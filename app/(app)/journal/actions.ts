"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { improvementEvents, journalNotes, projects, todos, type ProjectMilestone } from "@/db/schema";
import { track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

async function requireJournalAccess(): Promise<{ userId: string; accountId: string } | { error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Session expirée, reconnecte-toi." };
  const userId = data.claims.sub as string;
  const access = await requirePermission(userId, "dashboard");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  return { userId, accountId: access.accountId };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- To-do -------------------------------------------------------------

const createTodoSchema = z.object({ label: z.string().trim().min(1).max(200) });

export async function createTodo(label: string): Promise<{ error: string | null }> {
  const access = await requireJournalAccess();
  if ("error" in access) return access;
  const parsed = createTodoSchema.safeParse({ label });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Tâche invalide" };

  await db.insert(todos).values({ userId: access.accountId, label: parsed.data.label });
  revalidatePath("/journal");
  return { error: null };
}

const updateTodoSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(200).optional(),
  dueDate: z.string().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  isBusinessImprovement: z.boolean().optional(),
});

export async function updateTodo(input: z.infer<typeof updateTodoSchema>): Promise<{ error: string | null }> {
  const access = await requireJournalAccess();
  if ("error" in access) return access;
  const parsed = updateTodoSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Entrée invalide" };
  const { id, ...patch } = parsed.data;

  await db.update(todos).set(patch).where(and(eq(todos.id, id), eq(todos.userId, access.accountId)));
  revalidatePath("/journal");
  return { error: null };
}

export async function deleteTodo(id: string): Promise<{ error: string | null }> {
  const access = await requireJournalAccess();
  if ("error" in access) return access;

  await db.delete(todos).where(and(eq(todos.id, id), eq(todos.userId, access.accountId)));
  revalidatePath("/journal");
  return { error: null };
}

// A personal errand toggled done never touches the journal — only a task
// already marked "amélioration business" (or linked to a project, itself
// business by definition) generates an event, and only on the false → true
// transition.
export async function toggleTodo(id: string, done: boolean): Promise<{ error: string | null }> {
  const access = await requireJournalAccess();
  if ("error" in access) return access;

  const [before] = await db
    .select({ done: todos.done, label: todos.label, isBusinessImprovement: todos.isBusinessImprovement, projectId: todos.projectId })
    .from(todos)
    .where(and(eq(todos.id, id), eq(todos.userId, access.accountId)))
    .limit(1);
  if (!before) return { error: "Tâche introuvable" };

  await db
    .update(todos)
    .set({ done, doneAt: done ? new Date() : null })
    .where(and(eq(todos.id, id), eq(todos.userId, access.accountId)));

  const isBusinessEvent = !before.done && done && (before.isBusinessImprovement || before.projectId !== null);
  if (isBusinessEvent) {
    await db.insert(improvementEvents).values({
      userId: access.accountId,
      date: today(),
      type: "todo_business_improvement",
      label: `Tâche terminée : ${before.label}`,
      sourceId: id,
    });
  }

  await track("todo_completed", access.userId, { is_business_improvement: isBusinessEvent });
  revalidatePath("/journal");
  return { error: null };
}

// --- Projets -------------------------------------------------------------

const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).default(""),
  category: z.enum(["acquisition", "vente", "delivrabilite", "autre"]),
  deadline: z.string().nullable().optional(),
  milestoneTitles: z.array(z.string().trim().min(1).max(150)).min(1),
});

export async function createProject(input: z.infer<typeof createProjectSchema>): Promise<{ error: string | null }> {
  const access = await requireJournalAccess();
  if ("error" in access) return access;
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Projet invalide" };

  const milestones: ProjectMilestone[] = parsed.data.milestoneTitles.map((title, index) => ({
    order: index,
    title,
    done: false,
    doneAt: null,
  }));

  await db.insert(projects).values({
    userId: access.accountId,
    name: parsed.data.name,
    description: parsed.data.description,
    category: parsed.data.category,
    deadline: parsed.data.deadline ?? null,
    milestones,
  });

  revalidatePath("/journal");
  return { error: null };
}

// Jalon coché = événement d'amélioration automatique (brief §C). Projet à
// 100 % → status "done" (le client déclenche <Celebration /> en réponse à
// `justCompleted`).
export async function toggleMilestone(
  projectId: string,
  order: number,
  done: boolean
): Promise<{ error: string | null; justCompleted?: boolean }> {
  const access = await requireJournalAccess();
  if ("error" in access) return access;

  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, access.accountId)))
    .limit(1);
  if (!project) return { error: "Projet introuvable" };

  const milestone = project.milestones.find((m) => m.order === order);
  if (!milestone) return { error: "Jalon introuvable" };
  const wasDone = milestone.done;

  const nextMilestones = project.milestones.map((m) =>
    m.order === order ? { ...m, done, doneAt: done ? new Date().toISOString() : null } : m
  );
  const allDone = nextMilestones.every((m) => m.done);
  const justCompleted = allDone && project.status !== "done";

  await db
    .update(projects)
    .set({ milestones: nextMilestones, status: allDone ? "done" : "active" })
    .where(eq(projects.id, projectId));

  if (!wasDone && done) {
    await db.insert(improvementEvents).values({
      userId: access.accountId,
      date: today(),
      type: "project_milestone_completed",
      label: `${project.name} : ${milestone.title}`,
      sourceId: `${projectId}:${order}`,
    });
    await track("project_milestone_completed", access.userId, {});
  }

  revalidatePath("/journal");
  return { error: null, justCompleted };
}

// --- Note du jour ---------------------------------------------------------

const saveNoteSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), content: z.string().max(5000) });

export async function saveJournalNote(date: string, content: string): Promise<{ error: string | null }> {
  const access = await requireJournalAccess();
  if ("error" in access) return access;
  const parsed = saveNoteSchema.safeParse({ date, content });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Note invalide" };

  await db
    .insert(journalNotes)
    .values({ userId: access.accountId, date: parsed.data.date, content: parsed.data.content })
    .onConflictDoUpdate({
      target: [journalNotes.userId, journalNotes.date],
      set: { content: parsed.data.content, updatedAt: new Date() },
    });

  await track("journal_note_written", access.userId, {});
  revalidatePath("/journal");
  return { error: null };
}
