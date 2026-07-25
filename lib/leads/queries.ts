import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { leadComments, leadStageHistory, leads } from "@/db/schema";

import type { LeadInput } from "./schema";
import type { LeadCommentRow, LeadLostReason, LeadRow, LeadStage, LeadStageHistoryRow, LeadWithRelations } from "./types";

function toRow(row: typeof leads.$inferSelect): LeadRow {
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    source: row.source,
    offerId: row.offerId,
    potentialValueEur: row.potentialValueEur,
    setterId: row.setterId,
    closer: row.closer,
    stage: row.stage,
    isNoShow: row.isNoShow,
    lostReason: row.lostReason,
    saleId: row.saleId,
    reminderDate: row.reminderDate,
    reminderNote: row.reminderNote,
    reminderDone: row.reminderDone,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toCommentRow(row: typeof leadComments.$inferSelect): LeadCommentRow {
  return { id: row.id, leadId: row.leadId, userId: row.userId, body: row.body, createdAt: row.createdAt.toISOString() };
}

function toHistoryRow(row: typeof leadStageHistory.$inferSelect): LeadStageHistoryRow {
  return { id: row.id, leadId: row.leadId, fromStage: row.fromStage, toStage: row.toStage, changedAt: row.changedAt.toISOString() };
}

export async function getLeads(userId: string): Promise<LeadRow[]> {
  const rows = await db.select().from(leads).where(eq(leads.userId, userId)).orderBy(desc(leads.createdAt));
  return rows.map(toRow);
}

// Bulk comment counts for the board's cards — one query instead of N,
// keyed by leadId (missing key = 0 comments).
export async function getCommentCounts(userId: string): Promise<Record<string, number>> {
  const rows = await db
    .select({ leadId: leadComments.leadId })
    .from(leadComments)
    .innerJoin(leads, eq(leadComments.leadId, leads.id))
    .where(eq(leads.userId, userId));

  const counts: Record<string, number> = {};
  for (const row of rows) {
    counts[row.leadId] = (counts[row.leadId] ?? 0) + 1;
  }
  return counts;
}

export async function getLead(userId: string, id: string): Promise<LeadWithRelations | null> {
  const [row] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.userId, userId))).limit(1);
  if (!row) return null;

  const [comments, history] = await Promise.all([
    db.select().from(leadComments).where(eq(leadComments.leadId, id)).orderBy(asc(leadComments.createdAt)),
    db.select().from(leadStageHistory).where(eq(leadStageHistory.leadId, id)).orderBy(asc(leadStageHistory.changedAt)),
  ]);

  return { ...toRow(row), comments: comments.map(toCommentRow), history: history.map(toHistoryRow) };
}

// Insert + its first history row (fromStage: null) in one transaction, so
// a lead never exists without at least one history entry.
export async function createLead(userId: string, data: LeadInput): Promise<LeadRow> {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(leads).values({ userId, ...data }).returning();
    await tx.insert(leadStageHistory).values({ leadId: row.id, fromStage: null, toStage: row.stage });
    return toRow(row);
  });
}

// Assignment/field edits only — never touches stage/isNoShow/lostReason/saleId
// (those go through changeLeadStage/setNoShow/linkLeadToSale below).
export async function updateLead(userId: string, id: string, data: Partial<LeadInput>): Promise<void> {
  await db.update(leads).set(data).where(and(eq(leads.id, id), eq(leads.userId, userId)));
}

export async function changeLeadStage(
  userId: string,
  id: string,
  toStage: LeadStage,
  lostReason: LeadLostReason | null
): Promise<{ error: string | null }> {
  if (toStage === "perdu" && lostReason === null) {
    return { error: "Un motif est requis pour un lead perdu." };
  }

  const [current] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.userId, userId))).limit(1);
  if (!current) return { error: "Lead introuvable." };

  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({
        stage: toStage,
        lostReason: toStage === "perdu" ? lostReason : null,
        // Leaving rdv_fixe (whichever direction) clears the no-show flag —
        // it's a status on THAT stage, never carried elsewhere.
        isNoShow: toStage === "rdv_fixe" ? current.isNoShow : false,
        updatedAt: new Date(),
      })
      .where(and(eq(leads.id, id), eq(leads.userId, userId)));
    await tx.insert(leadStageHistory).values({ leadId: id, fromStage: current.stage, toStage });
  });

  return { error: null };
}

export async function setNoShow(userId: string, id: string, value: boolean): Promise<void> {
  await db.update(leads).set({ isNoShow: value, updatedAt: new Date() }).where(and(eq(leads.id, id), eq(leads.userId, userId)));
}

// Recoverable no-show: back into "conversation" for re-booking, flag cleared.
export async function recoverFromNoShow(userId: string, id: string): Promise<{ error: string | null }> {
  return changeLeadStage(userId, id, "conversation", null);
}

// Called ONLY from the sale-validation server action (app/(app)/acquisition/pipeline/validate-sale-action.ts)
// — never by the Kanban drag handler directly, which opens the validation
// modal instead of calling this.
export async function linkLeadToSale(userId: string, leadId: string, saleId: string): Promise<void> {
  const [current] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.userId, userId))).limit(1);
  if (!current) return;

  await db.transaction(async (tx) => {
    await tx
      .update(leads)
      .set({ stage: "close", saleId, isNoShow: false, updatedAt: new Date() })
      .where(and(eq(leads.id, leadId), eq(leads.userId, userId)));
    await tx.insert(leadStageHistory).values({ leadId, fromStage: current.stage, toStage: "close" });
  });
}

export async function addComment(userId: string, leadId: string, body: string): Promise<LeadCommentRow> {
  const [row] = await db.insert(leadComments).values({ leadId, userId, body }).returning();
  return toCommentRow(row);
}

export async function setReminder(userId: string, leadId: string, date: string | null, note: string | null): Promise<void> {
  await db
    .update(leads)
    .set({ reminderDate: date, reminderNote: note, reminderDone: false, updatedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.userId, userId)));
}

export async function toggleReminderDone(userId: string, leadId: string, done: boolean): Promise<void> {
  await db.update(leads).set({ reminderDone: done, updatedAt: new Date() }).where(and(eq(leads.id, leadId), eq(leads.userId, userId)));
}
