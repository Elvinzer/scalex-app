import { asc, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { adminIdeas } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";

export const adminIdeaStatuses = ["backlog", "in_progress", "completed"] as const;
export const adminIdeaStatusSchema = z.enum(adminIdeaStatuses);

const createAdminIdeaSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).default(""),
});

const moveAdminIdeaSchema = z.object({
  id: z.string().uuid(),
  status: adminIdeaStatusSchema,
});

export type AdminIdeaStatus = z.infer<typeof adminIdeaStatusSchema>;

export type AdminIdeaError = "invalid" | "create_failed" | "not_found" | "move_failed";

export type AdminIdea = {
  id: string;
  title: string;
  description: string;
  status: AdminIdeaStatus;
  position: number;
  createdAt: string;
  updatedAt: string;
};

type AdminIdeaRow = typeof adminIdeas.$inferSelect;
type AdminDbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function serializeIdea(row: AdminIdeaRow): AdminIdea {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function nextPosition(tx: typeof db | AdminDbTransaction, status: AdminIdeaStatus): Promise<number> {
  const [lastIdea] = await tx
    .select({ position: adminIdeas.position })
    .from(adminIdeas)
    .where(eq(adminIdeas.status, status))
    .orderBy(desc(adminIdeas.position))
    .limit(1);

  return (lastIdea?.position ?? -1) + 1;
}

export async function getAdminIdeas(): Promise<AdminIdea[]> {
  await requireAdmin();

  const rows = await db
    .select()
    .from(adminIdeas)
    .orderBy(asc(adminIdeas.position), asc(adminIdeas.createdAt));

  return rows.map(serializeIdea);
}

export type AdminIdeaActionResult = {
  error: AdminIdeaError | null;
  idea?: AdminIdea;
};

export async function createAdminIdea(input: unknown): Promise<AdminIdeaActionResult> {
  const { userId } = await requireAdmin();
  const parsed = createAdminIdeaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "invalid" };
  }

  try {
    const row = await db.transaction(async (tx) => {
      const position = await nextPosition(tx, "backlog");
      const [created] = await tx
        .insert(adminIdeas)
        .values({
          title: parsed.data.title,
          description: parsed.data.description,
          position,
          createdByUserId: userId,
        })
        .returning();
      return created;
    });

    if (!row) return { error: "create_failed" };

    revalidatePath("/admin/ideas");
    return { error: null, idea: serializeIdea(row) };
  } catch {
    return { error: "create_failed" };
  }
}

export async function moveAdminIdea(input: unknown): Promise<AdminIdeaActionResult> {
  await requireAdmin();
  const parsed = moveAdminIdeaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "invalid" };
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(adminIdeas).where(eq(adminIdeas.id, parsed.data.id)).limit(1);
      if (!current) return { kind: "not_found" as const };

      if (current.status === parsed.data.status) {
        return { kind: "unchanged" as const, row: current };
      }

      const position = await nextPosition(tx, parsed.data.status);
      const [updated] = await tx
        .update(adminIdeas)
        .set({ status: parsed.data.status, position, updatedAt: new Date() })
        .where(eq(adminIdeas.id, parsed.data.id))
        .returning();
      return updated ? { kind: "updated" as const, row: updated } : { kind: "failed" as const };
    });

    if (result.kind === "not_found") return { error: "not_found" };
    if (result.kind === "failed") return { error: "move_failed" };

    const row = result.row;

    revalidatePath("/admin/ideas");
    return { error: null, idea: serializeIdea(row) };
  } catch {
    return { error: "move_failed" };
  }
}
