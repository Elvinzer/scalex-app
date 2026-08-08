"use server";

import { and, desc, eq } from "drizzle-orm";
import { refresh, revalidatePath } from "next/cache";

import { db } from "@/db";
import {
  improvementInitiatives,
  initiativeMeasurements,
  initiativeNudges,
  initiativeWeeklyFocus,
  insightRecords,
  projects,
  teamMembers,
  todos,
} from "@/db/schema";
import { requireUserId } from "@/lib/current-user";
import {
  calculateBaseline,
  calculateComparableMeasurement,
} from "@/lib/insight-execution/metrics";
import { materializeSourceInsight } from "@/lib/insight-execution/source-adapters";
import {
  canAccessAssignedInitiative,
  canTransitionInitiative,
  decisionForInitiativeStatus,
} from "@/lib/insight-execution/state";
import {
  assignmentInputSchema,
  focusInputSchema,
  insightDecisionInputSchema,
  initiativeStatusInputSchema,
  launchInsightSchema,
  materializeInsightSchema,
  nudgeActionSchema,
  qualitativeResultSchema,
} from "@/lib/insight-execution/schemas";
import {
  recordInitiativeLaunched,
  recordInitiativeMeasured,
  markInitiativeCompleted,
} from "@/lib/insight-execution/service";
import { addDays, currentWeekStart } from "@/lib/insight-execution/week";
import { getAccountContext } from "@/lib/team/context";

import { getInsightHistory } from "./queries";
import type { InsightHistoryItem } from "./types";

type Access = {
  userId: string;
  accountId: string;
  isOwner: boolean;
  teamMemberId: string | null;
};

async function requireExecutionAccess(): Promise<Access | { error: string }> {
  try {
    const userId = await requireUserId();
    const context = await getAccountContext(userId);
    if (!context) return { error: "Ton accès à cet espace a expiré." };
    const delegatedAccess =
      context.permissions === "all" ||
      context.permissions.has("dashboard") ||
      context.permissions.has("diagnostic") ||
      context.permissions.has("funnel") ||
      context.permissions.has("acquisition:contenu");
    if (!context.isOwner && !delegatedAccess)
      return { error: "Tu n'as pas accès au suivi des actions." };
    let teamMemberId: string | null = null;
    if (!context.isOwner) {
      const [member] = await db
        .select({ id: teamMembers.id })
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.accountId, context.accountId),
            eq(teamMembers.memberUserId, userId),
            eq(teamMembers.status, "active"),
          ),
        )
        .limit(1);
      teamMemberId = member?.id ?? null;
    }
    return {
      userId,
      accountId: context.accountId,
      isOwner: context.isOwner,
      teamMemberId,
    };
  } catch {
    return { error: "Session expirée, reconnecte-toi." };
  }
}

async function getActionForAccess(access: Access, initiativeId: string) {
  const [initiative] = await db
    .select()
    .from(improvementInitiatives)
    .where(
      and(
        eq(improvementInitiatives.id, initiativeId),
        eq(improvementInitiatives.userId, access.accountId),
      ),
    )
    .limit(1);
  if (!initiative) return null;
  if (
    !canAccessAssignedInitiative(
      access.isOwner,
      initiative.assignedTeamMemberId,
      access.teamMemberId,
    )
  )
    return null;
  return initiative;
}

function revalidateExecutionSurfaces(): void {
  // Re-render the current App Router tree as part of the Server Action
  // response. `revalidatePath` invalidates the server cache, but by itself it
  // does not guarantee that the client currently displaying the action gets
  // the updated RSC payload in the same round trip.
  refresh();
  revalidatePath("/dashboard");
  revalidatePath("/diagnostic");
  revalidatePath("/journal");
}

export async function materializeInsight(
  input: unknown,
): Promise<{ error: string | null; insightId?: string }> {
  const access = await requireExecutionAccess();
  if ("error" in access) return access;
  const parsed = materializeInsightSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Insight invalide" };

  const row = await materializeSourceInsight(access.accountId, parsed.data);
  if (!row) {
    return {
      error:
        parsed.data.sourceType === "copilote"
          ? "Une conversation Copilote doit produire une action explicite avant d'entrer dans l'historique."
          : "Cette recommandation n'est plus disponible.",
    };
  }
  revalidateExecutionSurfaces();
  return { error: null, insightId: row.id };
}

export async function decideInsight(
  input: unknown,
): Promise<{ error: string | null }> {
  const access = await requireExecutionAccess();
  if ("error" in access) return access;
  const parsed = insightDecisionInputSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Décision invalide" };

  const [record] = await db
    .select({ id: insightRecords.id })
    .from(insightRecords)
    .where(
      and(
        eq(insightRecords.id, parsed.data.insightId),
        eq(insightRecords.userId, access.accountId),
      ),
    )
    .limit(1);
  if (!record) return { error: "Insight introuvable" };

  const [linkedInitiative] = await db
    .select({
      id: improvementInitiatives.id,
      assignedTeamMemberId: improvementInitiatives.assignedTeamMemberId,
      status: improvementInitiatives.status,
    })
    .from(improvementInitiatives)
    .where(
      and(
        eq(improvementInitiatives.userId, access.accountId),
        eq(improvementInitiatives.insightRecordId, record.id),
      ),
    )
    .limit(1);
  if (
    linkedInitiative &&
    !canAccessAssignedInitiative(
      access.isOwner,
      linkedInitiative.assignedTeamMemberId,
      access.teamMemberId,
    )
  ) {
    return { error: "Cette action est attribuée à un autre membre." };
  }
  if (
    parsed.data.decision === "launched" ||
    parsed.data.decision === "completed"
  ) {
    return { error: "Lance ou termine cette action depuis son suivi Journal." };
  }
  if (linkedInitiative && parsed.data.decision === "later") {
    return { error: "Reporte cette action depuis son suivi Journal." };
  }
  if (
    linkedInitiative &&
    parsed.data.decision === "todo" &&
    linkedInitiative.status !== "cancelled"
  ) {
    return {
      error: "Cette action est déjà lancée. Reprends-la depuis le Journal.",
    };
  }
  if (
    linkedInitiative?.status === "measured" &&
    parsed.data.decision === "dismissed"
  ) {
    return { error: "Cette action possède déjà un résultat mesuré." };
  }

  const now = new Date();
  const resumeAt =
    parsed.data.decision === "later"
      ? (parsed.data.resumeAt ?? addDays(now.toISOString().slice(0, 10), 7))
      : null;
  await db
    .update(insightRecords)
    .set({ decision: parsed.data.decision, resumeAt, updatedAt: now })
    .where(
      and(
        eq(insightRecords.id, parsed.data.insightId),
        eq(insightRecords.userId, access.accountId),
      ),
    );

  if (parsed.data.decision === "dismissed") {
    await db
      .update(improvementInitiatives)
      .set({ status: "cancelled", updatedAt: now, lastActivityAt: now })
      .where(
        and(
          eq(improvementInitiatives.userId, access.accountId),
          eq(improvementInitiatives.insightRecordId, parsed.data.insightId),
        ),
      );
    if (linkedInitiative?.id) {
      await db
        .delete(initiativeWeeklyFocus)
        .where(
          and(
            eq(initiativeWeeklyFocus.userId, access.accountId),
            eq(initiativeWeeklyFocus.initiativeId, linkedInitiative.id),
          ),
        );
    }
  }

  revalidateExecutionSurfaces();
  return { error: null };
}

export async function launchInsight(
  input: unknown,
): Promise<{
  error: string | null;
  initiativeId?: string;
  insight?: InsightHistoryItem;
}> {
  const access = await requireExecutionAccess();
  if ("error" in access) return access;
  const parsed = launchInsightSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Lancement invalide" };

  if (parsed.data.assignedTeamMemberId && !access.isOwner) {
    return { error: "Seul le propriétaire peut attribuer une action." };
  }

  const [record] = await db
    .select()
    .from(insightRecords)
    .where(
      and(
        eq(insightRecords.id, parsed.data.insightId),
        eq(insightRecords.userId, access.accountId),
      ),
    )
    .limit(1);
  if (!record) return { error: "Insight introuvable" };
  if (record.decision === "dismissed")
    return {
      error: "Cet insight a été écarté. Réactive-le avant de le lancer.",
    };

  const [existingInitiative] = await db
    .select({
      id: improvementInitiatives.id,
      status: improvementInitiatives.status,
      assignedTeamMemberId: improvementInitiatives.assignedTeamMemberId,
    })
    .from(improvementInitiatives)
    .where(
      and(
        eq(improvementInitiatives.userId, access.accountId),
        eq(improvementInitiatives.insightRecordId, record.id),
      ),
    )
    .limit(1);
  if (
    existingInitiative &&
    !canAccessAssignedInitiative(
      access.isOwner,
      existingInitiative.assignedTeamMemberId,
      access.teamMemberId,
    )
  ) {
    return { error: "Cette action est attribuée à un autre membre." };
  }
  if (existingInitiative?.status === "measured")
    return { error: "Cette action a déjà un résultat mesuré." };
  if (
    existingInitiative &&
    ["completed", "awaiting_measurement"].includes(existingInitiative.status)
  ) {
    revalidateExecutionSurfaces();
    return { error: null, initiativeId: existingInitiative.id };
  }

  const assignedTeamMemberId =
    parsed.data.assignedTeamMemberId ??
    (access.isOwner ? null : access.teamMemberId);
  if (assignedTeamMemberId) {
    const [member] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.id, assignedTeamMemberId),
          eq(teamMembers.accountId, access.accountId),
          eq(teamMembers.status, "active"),
        ),
      )
      .limit(1);
    if (!member) return { error: "Membre d'équipe introuvable ou inactif." };
  }

  const baseline = await calculateBaseline(access.accountId, record.metricKey);
  const now = new Date();
  const weekStart = currentWeekStart();
  let result: {
    initiative: typeof improvementInitiatives.$inferSelect;
    created: boolean;
  };
  try {
    result = await db.transaction(async (tx) => {
      let [initiative] = await tx
        .select()
        .from(improvementInitiatives)
        .where(
          and(
            eq(improvementInitiatives.userId, access.accountId),
            eq(improvementInitiatives.insightRecordId, record.id),
          ),
        )
        .limit(1);
      let created = false;

      if (!initiative) {
        [initiative] = await tx
          .insert(improvementInitiatives)
          .values({
            userId: access.accountId,
            insightRecordId: record.id,
            title: record.title,
            actionText: record.insightText,
            status: "in_progress",
            dueDate: parsed.data.dueDate ?? null,
            assignedTeamMemberId,
            baseline,
            lastActivityAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({
            target: [
              improvementInitiatives.userId,
              improvementInitiatives.insightRecordId,
            ],
          })
          .returning();
        created = Boolean(initiative);
        if (!initiative) {
          [initiative] = await tx
            .select()
            .from(improvementInitiatives)
            .where(
              and(
                eq(improvementInitiatives.userId, access.accountId),
                eq(improvementInitiatives.insightRecordId, record.id),
              ),
            )
            .limit(1);
        }
      }
      if (!initiative) throw new Error("Impossible de créer cette action.");

      let todoId = initiative.todoId;
      let projectId = initiative.projectId;
      if (!todoId && !projectId) {
        if (parsed.data.targetType === "project") {
          const [project] = await tx
            .select({ id: projects.id })
            .from(projects)
            .where(
              and(
                eq(projects.id, parsed.data.targetId!),
                eq(projects.userId, access.accountId),
              ),
            )
            .limit(1);
          if (!project) throw new Error("Projet introuvable.");
          projectId = project.id;
        } else if (parsed.data.targetId) {
          const [todo] = await tx
            .select({ id: todos.id })
            .from(todos)
            .where(
              and(
                eq(todos.id, parsed.data.targetId),
                eq(todos.userId, access.accountId),
              ),
            )
            .limit(1);
          if (!todo) throw new Error("Tâche introuvable.");
          todoId = todo.id;
          await tx
            .update(todos)
            .set({ isBusinessImprovement: true })
            .where(
              and(eq(todos.id, todo.id), eq(todos.userId, access.accountId)),
            );
        } else {
          const [todo] = await tx
            .insert(todos)
            .values({
              userId: access.accountId,
              label: record.title.slice(0, 200),
              dueDate: parsed.data.dueDate ?? null,
              isBusinessImprovement: true,
            })
            .returning({ id: todos.id });
          todoId = todo?.id ?? null;
        }
      }

      if (
        created ||
        initiative.status === "planned" ||
        initiative.status === "cancelled" ||
        (!initiative.assignedTeamMemberId && assignedTeamMemberId)
      ) {
        [initiative] = await tx
          .update(improvementInitiatives)
          .set({
            status: "in_progress",
            dueDate: initiative.dueDate ?? parsed.data.dueDate ?? null,
            assignedTeamMemberId:
              initiative.assignedTeamMemberId ?? assignedTeamMemberId,
            todoId,
            projectId,
            baseline: initiative.baseline ?? baseline,
            lastActivityAt: now,
            updatedAt: now,
          })
          .where(
            and(
              eq(improvementInitiatives.id, initiative.id),
              eq(improvementInitiatives.userId, access.accountId),
            ),
          )
          .returning();
      }

      await tx
        .update(insightRecords)
        .set({ decision: "launched", resumeAt: null, updatedAt: now })
        .where(
          and(
            eq(insightRecords.id, record.id),
            eq(insightRecords.userId, access.accountId),
          ),
        );

      if (parsed.data.makeWeeklyFocus) {
        await tx
          .insert(initiativeWeeklyFocus)
          .values({
            userId: access.accountId,
            weekStart,
            initiativeId: initiative.id,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              initiativeWeeklyFocus.userId,
              initiativeWeeklyFocus.weekStart,
            ],
            set: { initiativeId: initiative.id, updatedAt: now },
          });
      }

      return { initiative, created };
    });
  } catch {
    return {
      error:
        "Impossible de lancer cette action. Vérifie que sa cible Journal existe encore.",
    };
  }

  if (result.created)
    await recordInitiativeLaunched(
      access.accountId,
      result.initiative.id,
      result.initiative.title,
    );

  // Return the freshly joined history item so the client can replace the
  // card immediately, including its new initiative status and weekly focus.
  // The router refresh below remains useful for the other execution surfaces.
  let updatedInsight: InsightHistoryItem | undefined;
  try {
    updatedInsight = (await getInsightHistory(access.accountId, {
      sourceType: record.sourceType,
    })).find((item) => item.id === record.id);
  } catch {
    // The mutation is already committed. The client can still reconcile via
    // the App Router refresh when the optional response projection fails.
  }
  revalidateExecutionSurfaces();
  return {
    error: null,
    initiativeId: result.initiative.id,
    insight: updatedInsight,
  };
}

export async function updateInitiativeStatus(
  input: unknown,
): Promise<{ error: string | null }> {
  const access = await requireExecutionAccess();
  if ("error" in access) return access;
  const parsed = initiativeStatusInputSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Statut invalide" };

  const initiative = await getActionForAccess(access, parsed.data.initiativeId);
  if (!initiative) return { error: "Action introuvable" };
  if (parsed.data.status === "measured")
    return { error: "Le statut Résultat mesuré dépend d'une mesure valide." };
  if (!canTransitionInitiative(initiative.status, parsed.data.status))
    return { error: "Cette transition n'est pas disponible." };

  const now = new Date();
  await db
    .update(improvementInitiatives)
    .set({
      status: parsed.data.status,
      completedAt:
        parsed.data.status === "completed"
          ? (initiative.completedAt ?? now)
          : parsed.data.status === "in_progress"
            ? null
            : initiative.completedAt,
      snoozedUntil:
        parsed.data.status === "paused" ? null : initiative.snoozedUntil,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(improvementInitiatives.id, initiative.id),
        eq(improvementInitiatives.userId, access.accountId),
      ),
    );
  await db
    .update(insightRecords)
    .set({
      decision:
        parsed.data.status === "cancelled"
          ? "dismissed"
          : decisionForInitiativeStatus(parsed.data.status),
      updatedAt: now,
    })
    .where(
      and(
        eq(insightRecords.id, initiative.insightRecordId),
        eq(insightRecords.userId, access.accountId),
      ),
    );
  if (parsed.data.status === "completed")
    await markInitiativeCompleted(
      access.accountId,
      initiative.id,
      initiative.title,
    );
  if (parsed.data.status === "cancelled") {
    await db
      .delete(initiativeWeeklyFocus)
      .where(
        and(
          eq(initiativeWeeklyFocus.userId, access.accountId),
          eq(initiativeWeeklyFocus.initiativeId, initiative.id),
        ),
      );
  }
  revalidateExecutionSurfaces();
  return { error: null };
}

export async function setWeeklyFocus(
  input: unknown,
): Promise<{ error: string | null }> {
  const access = await requireExecutionAccess();
  if ("error" in access) return access;
  const parsed = focusInputSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Priorité invalide" };
  const initiative = await getActionForAccess(access, parsed.data.initiativeId);
  if (!initiative) return { error: "Action introuvable" };
  if (["cancelled", "measured"].includes(initiative.status))
    return { error: "Cette action ne peut plus devenir la priorité." };
  const now = new Date();
  await db
    .insert(initiativeWeeklyFocus)
    .values({
      userId: access.accountId,
      weekStart: currentWeekStart(),
      initiativeId: initiative.id,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [initiativeWeeklyFocus.userId, initiativeWeeklyFocus.weekStart],
      set: { initiativeId: initiative.id, updatedAt: now },
    });
  revalidateExecutionSurfaces();
  return { error: null };
}

export async function assignInitiative(
  input: unknown,
): Promise<{ error: string | null }> {
  const access = await requireExecutionAccess();
  if ("error" in access) return access;
  if (!access.isOwner)
    return { error: "Seul le propriétaire peut attribuer une action." };
  const parsed = assignmentInputSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Assignation invalide" };
  const initiative = await getActionForAccess(access, parsed.data.initiativeId);
  if (!initiative) return { error: "Action introuvable" };
  if (parsed.data.teamMemberId) {
    const [member] = await db
      .select({ id: teamMembers.id })
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.id, parsed.data.teamMemberId),
          eq(teamMembers.accountId, access.accountId),
          eq(teamMembers.status, "active"),
        ),
      )
      .limit(1);
    if (!member) return { error: "Membre d'équipe introuvable ou inactif." };
  }
  await db
    .update(improvementInitiatives)
    .set({
      assignedTeamMemberId: parsed.data.teamMemberId,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(improvementInitiatives.id, initiative.id),
        eq(improvementInitiatives.userId, access.accountId),
      ),
    );
  revalidateExecutionSurfaces();
  return { error: null };
}

export async function measureInitiative(
  initiativeId: string,
): Promise<{ error: string | null; ready: boolean; reason?: string }> {
  const access = await requireExecutionAccess();
  if ("error" in access) return { ...access, ready: false };
  const initiative = await getActionForAccess(access, initiativeId);
  if (!initiative) return { error: "Action introuvable", ready: false };
  if (
    initiative.status !== "completed" &&
    initiative.status !== "awaiting_measurement" &&
    initiative.status !== "measured"
  ) {
    return {
      error: "Termine l'action avant de mesurer son résultat.",
      ready: false,
    };
  }

  const measurement = await calculateComparableMeasurement(
    access.accountId,
    initiative.baseline,
  );
  if (!measurement.ready) {
    if (initiative.status !== "measured") {
      await db
        .update(improvementInitiatives)
        .set({
          status: "awaiting_measurement",
          lastActivityAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(improvementInitiatives.id, initiative.id),
            eq(improvementInitiatives.userId, access.accountId),
          ),
        );
    }
    revalidateExecutionSurfaces();
    return { error: null, ready: false, reason: measurement.reason };
  }

  const [latest] = await db
    .select({ version: initiativeMeasurements.version })
    .from(initiativeMeasurements)
    .where(
      and(
        eq(initiativeMeasurements.initiativeId, initiative.id),
        eq(initiativeMeasurements.userId, access.accountId),
      ),
    )
    .orderBy(desc(initiativeMeasurements.version))
    .limit(1);
  const snapshot = measurement.snapshot;
  const version = (latest?.version ?? 0) + 1;
  const now = new Date();
  const [insertedMeasurement] = await db
    .insert(initiativeMeasurements)
    .values({
      userId: access.accountId,
      initiativeId: initiative.id,
      version,
      evidence: snapshot.evidence,
      metricKey: snapshot.metricKey,
      unit: snapshot.unit,
      beforeValue: snapshot.beforeValue,
      afterValue: snapshot.afterValue,
      deltaValue: snapshot.deltaValue,
      beforePeriodStart: snapshot.beforePeriodStart,
      beforePeriodEnd: snapshot.beforePeriodEnd,
      afterPeriodStart: snapshot.afterPeriodStart,
      afterPeriodEnd: snapshot.afterPeriodEnd,
      sampleSize: snapshot.sampleSize,
      cashImpactEur: snapshot.cashImpactEur,
      cashCurrency: snapshot.cashCurrency,
      source: snapshot.source,
      note: snapshot.note,
      measuredAt: now,
    })
    .onConflictDoNothing({
      target: [
        initiativeMeasurements.initiativeId,
        initiativeMeasurements.version,
      ],
    })
    .returning({ id: initiativeMeasurements.id });
  if (!insertedMeasurement) {
    revalidateExecutionSurfaces();
    return { error: null, ready: true };
  }
  await db
    .update(improvementInitiatives)
    .set({
      status: "measured",
      measuredAt: now,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(improvementInitiatives.id, initiative.id),
        eq(improvementInitiatives.userId, access.accountId),
      ),
    );
  await db
    .update(insightRecords)
    .set({ decision: "completed", updatedAt: now })
    .where(
      and(
        eq(insightRecords.id, initiative.insightRecordId),
        eq(insightRecords.userId, access.accountId),
      ),
    );
  await recordInitiativeMeasured(
    access.accountId,
    initiative.id,
    initiative.title,
  );
  revalidateExecutionSurfaces();
  return { error: null, ready: true };
}

export async function addQualitativeResult(
  input: unknown,
): Promise<{ error: string | null }> {
  const access = await requireExecutionAccess();
  if ("error" in access) return access;
  const parsed = qualitativeResultSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Observation invalide" };
  const initiative = await getActionForAccess(access, parsed.data.initiativeId);
  if (!initiative) return { error: "Action introuvable" };
  if (
    initiative.status !== "completed" &&
    initiative.status !== "awaiting_measurement"
  ) {
    return { error: "Termine l'action avant d'ajouter une observation." };
  }
  const [latest] = await db
    .select({ version: initiativeMeasurements.version })
    .from(initiativeMeasurements)
    .where(
      and(
        eq(initiativeMeasurements.initiativeId, initiative.id),
        eq(initiativeMeasurements.userId, access.accountId),
      ),
    )
    .orderBy(desc(initiativeMeasurements.version))
    .limit(1);
  const now = new Date();
  await db
    .insert(initiativeMeasurements)
    .values({
      userId: access.accountId,
      initiativeId: initiative.id,
      version: (latest?.version ?? 0) + 1,
      evidence: "qualitative",
      note: parsed.data.note,
      source: "user_observation",
      measuredAt: now,
    })
    .onConflictDoNothing({
      target: [
        initiativeMeasurements.initiativeId,
        initiativeMeasurements.version,
      ],
    });
  await db
    .update(improvementInitiatives)
    .set({
      status: "completed",
      resultNote: parsed.data.note,
      completedAt: initiative.completedAt ?? now,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(improvementInitiatives.id, initiative.id),
        eq(improvementInitiatives.userId, access.accountId),
      ),
    );
  await db
    .update(insightRecords)
    .set({ decision: "completed", updatedAt: now })
    .where(
      and(
        eq(insightRecords.id, initiative.insightRecordId),
        eq(insightRecords.userId, access.accountId),
      ),
    );
  await markInitiativeCompleted(
    access.accountId,
    initiative.id,
    initiative.title,
  );
  revalidateExecutionSurfaces();
  return { error: null };
}

export async function postponeInitiative(
  input: unknown,
): Promise<{ error: string | null }> {
  const access = await requireExecutionAccess();
  if ("error" in access) return access;
  const parsed = nudgeActionSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Action invalide" };
  const until = addDays(new Date().toISOString().slice(0, 10), 7);
  const initiative = await getActionForAccess(access, parsed.data.initiativeId);
  if (!initiative) return { error: "Action introuvable" };
  if (
    !["planned", "in_progress", "awaiting_measurement"].includes(
      initiative.status,
    )
  ) {
    return { error: "Cette action ne peut plus être reportée." };
  }
  await db
    .update(improvementInitiatives)
    .set({
      snoozedUntil: until,
      lastActivityAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(improvementInitiatives.id, initiative.id),
        eq(improvementInitiatives.userId, access.accountId),
      ),
    );
  await db
    .update(initiativeNudges)
    .set({ dismissedAt: new Date() })
    .where(
      and(
        eq(initiativeNudges.initiativeId, parsed.data.initiativeId),
        eq(initiativeNudges.userId, access.accountId),
        eq(initiativeNudges.weekStart, currentWeekStart()),
      ),
    );
  revalidateExecutionSurfaces();
  return { error: null };
}

export async function pauseInitiative(
  input: unknown,
): Promise<{ error: string | null }> {
  const access = await requireExecutionAccess();
  if ("error" in access) return access;
  const parsed = nudgeActionSchema.safeParse(input);
  if (!parsed.success)
    return { error: parsed.error.issues[0]?.message ?? "Action invalide" };
  const initiative = await getActionForAccess(access, parsed.data.initiativeId);
  if (!initiative) return { error: "Action introuvable" };
  if (!canTransitionInitiative(initiative.status, "paused"))
    return { error: "Cette action ne peut pas être mise en pause." };
  const now = new Date();
  await db
    .update(improvementInitiatives)
    .set({
      status: "paused",
      snoozedUntil: null,
      lastActivityAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(improvementInitiatives.id, initiative.id),
        eq(improvementInitiatives.userId, access.accountId),
      ),
    );
  await db
    .update(initiativeNudges)
    .set({ dismissedAt: now })
    .where(
      and(
        eq(initiativeNudges.initiativeId, initiative.id),
        eq(initiativeNudges.userId, access.accountId),
      ),
    );
  revalidateExecutionSurfaces();
  return { error: null };
}
