"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { improvementEvents, improvementInitiatives, insightRecords, leads } from "@/db/schema";
import { track } from "@/lib/analytics";
import { calculateBaseline } from "@/lib/insight-execution/metrics";
import { materializeSourceInsight } from "@/lib/insight-execution/source-adapters";
import { markInitiativeCompleted, recordInitiativeLaunched } from "@/lib/insight-execution/service";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";
import { addDays } from "@/lib/insight-execution/week";
import { JOURNAL_ACTION_TYPES, type JournalActionType } from "@/lib/journal/action-generator";
import { revalidateJournalSurfaces } from "@/lib/revalidate-data";

type JournalAccess = { userId: string; accountId: string };

async function requireJournalLoopAccess(): Promise<JournalAccess | { error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Session expirée, reconnecte-toi." };
  const userId = data.claims.sub as string;
  const access = await requirePermission(userId, "dashboard");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  return { userId, accountId: access.accountId };
}

const actionInputSchema = z.object({
  type: z.enum(JOURNAL_ACTION_TYPES),
  sourceId: z.string().trim().min(1).max(160),
});

function sourceTypeForAction(type: JournalActionType): "diagnostic_metric" | "diagnostic_lever" | "content_recommendation" | null {
  if (type === "bottleneck") return "diagnostic_metric";
  if (type === "lever") return "diagnostic_lever";
  if (type === "content") return "content_recommendation";
  return null;
}

async function materializeJournalSource(accountId: string, input: z.infer<typeof actionInputSchema>) {
  const sourceType = sourceTypeForAction(input.type);
  if (!sourceType) return null;
  return materializeSourceInsight(accountId, { sourceType, sourceId: input.sourceId });
}

export async function startJournalAction(input: unknown): Promise<{ error: string | null; initiativeId?: string }> {
  const access = await requireJournalLoopAccess();
  if ("error" in access) return access;
  const parsed = actionInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Action invalide." };

  if (parsed.data.type === "data_checkin") {
    return { error: "Ce check-in se remplit depuis la page Mes chiffres." };
  }
  if (parsed.data.type === "lead_reminder") {
    const leadId = z.string().uuid().safeParse(parsed.data.sourceId);
    if (!leadId.success) return { error: "Relance invalide." };
    const [lead] = await db.select({ id: leads.id, reminderDone: leads.reminderDone }).from(leads).where(and(eq(leads.id, leadId.data), eq(leads.accountId, access.accountId))).limit(1);
    if (!lead || lead.reminderDone) return { error: "Cette relance n'est plus disponible." };
    await track("action_started", access.userId, { type: parsed.data.type });
    return { error: null };
  }

  const record = await materializeJournalSource(access.accountId, parsed.data);
  if (!record) return { error: "Cette recommandation n'est plus disponible." };
  const baseline = record.metricKey ? await calculateBaseline(access.accountId, record.metricKey) : null;
  const now = new Date();
  let initiativeId: string | undefined;
  let created = false;

  await db.transaction(async (tx) => {
    let [initiative] = await tx.select().from(improvementInitiatives).where(and(eq(improvementInitiatives.userId, access.accountId), eq(improvementInitiatives.insightRecordId, record.id))).limit(1);
    if (!initiative) {
      [initiative] = await tx.insert(improvementInitiatives).values({
        userId: access.accountId,
        insightRecordId: record.id,
        title: record.title,
        actionText: record.insightText,
        status: "in_progress",
        baseline,
        lastActivityAt: now,
        updatedAt: now,
      }).returning();
      created = true;
    } else if (initiative.status !== "measured") {
      [initiative] = await tx.update(improvementInitiatives).set({
        status: "in_progress",
        snoozedUntil: null,
        baseline: initiative.baseline ?? baseline,
        lastActivityAt: now,
        updatedAt: now,
      }).where(and(eq(improvementInitiatives.id, initiative.id), eq(improvementInitiatives.userId, access.accountId))).returning();
    }
    if (!initiative) throw new Error("Impossible de lancer cette action.");
    initiativeId = initiative.id;
    await tx.update(insightRecords).set({ decision: "launched", resumeAt: null, updatedAt: now }).where(and(eq(insightRecords.id, record.id), eq(insightRecords.userId, access.accountId)));
  });

  if (created && initiativeId) await recordInitiativeLaunched(access.accountId, initiativeId, record.title);
  await track("action_started", access.userId, { type: parsed.data.type });
  revalidateJournalSurfaces(access.accountId);
  return { error: null, initiativeId };
}

export async function completeJournalAction(input: unknown): Promise<{ error: string | null }> {
  const access = await requireJournalLoopAccess();
  if ("error" in access) return access;
  const parsed = actionInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Action invalide." };

  if (parsed.data.type === "data_checkin") return { error: "Renseigne d'abord tes chiffres dans Mes chiffres." };
  if (parsed.data.type === "lead_reminder") {
    const leadId = z.string().uuid().safeParse(parsed.data.sourceId);
    if (!leadId.success) return { error: "Relance invalide." };
    const [updated] = await db.update(leads).set({ reminderDone: true, updatedAt: new Date() }).where(and(eq(leads.id, leadId.data), eq(leads.accountId, access.accountId))).returning({ id: leads.id });
    if (!updated) return { error: "Relance introuvable." };
    await db.insert(improvementEvents).values({
      userId: access.accountId,
      date: new Date().toISOString().slice(0, 10),
      type: "todo_business_improvement",
      label: "Relance lead terminée",
      sourceId: updated.id,
    });
    await track("action_completed", access.userId, { type: parsed.data.type, metric_key: "followupRecovery" });
    revalidateJournalSurfaces(access.accountId);
    return { error: null };
  }

  const record = await materializeJournalSource(access.accountId, parsed.data);
  if (!record) return { error: "Cette recommandation n'est plus disponible." };
  const baseline = record.metricKey ? await calculateBaseline(access.accountId, record.metricKey) : null;
  const now = new Date();
  let initiativeId: string | undefined;

  await db.transaction(async (tx) => {
    let [initiative] = await tx.select().from(improvementInitiatives).where(and(eq(improvementInitiatives.userId, access.accountId), eq(improvementInitiatives.insightRecordId, record.id))).limit(1);
    if (!initiative) {
      [initiative] = await tx.insert(improvementInitiatives).values({
        userId: access.accountId,
        insightRecordId: record.id,
        title: record.title,
        actionText: record.insightText,
        status: "in_progress",
        baseline,
        lastActivityAt: now,
        updatedAt: now,
      }).returning();
    }
    if (!initiative) throw new Error("Impossible d'enregistrer cette action.");
    initiativeId = initiative.id;
    if (!initiative.baseline && baseline) {
      await tx.update(improvementInitiatives).set({ baseline, updatedAt: now }).where(and(eq(improvementInitiatives.id, initiative.id), eq(improvementInitiatives.userId, access.accountId)));
    }
  });

  if (!initiativeId) return { error: "Impossible d'enregistrer cette action." };
  await markInitiativeCompleted(access.accountId, initiativeId, record.title);
  await track("action_completed", access.userId, { type: parsed.data.type, metric_key: record.metricKey });
  revalidateJournalSurfaces(access.accountId);
  return { error: null };
}

export async function snoozeJournalAction(input: unknown): Promise<{ error: string | null }> {
  const access = await requireJournalLoopAccess();
  if ("error" in access) return access;
  const parsed = actionInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Action invalide." };
  if (parsed.data.type === "data_checkin" || parsed.data.type === "lead_reminder") return { error: "Cette action se gère depuis sa page source." };

  const record = await materializeJournalSource(access.accountId, parsed.data);
  if (!record) return { error: "Cette recommandation n'est plus disponible." };
  const until = addDays(new Date().toISOString().slice(0, 10), 7);
  const now = new Date();
  await db.update(insightRecords).set({ decision: "later", resumeAt: until, updatedAt: now }).where(and(eq(insightRecords.id, record.id), eq(insightRecords.userId, access.accountId)));
  await db.update(improvementInitiatives).set({ snoozedUntil: until, lastActivityAt: now, updatedAt: now }).where(and(eq(improvementInitiatives.insightRecordId, record.id), eq(improvementInitiatives.userId, access.accountId)));
  await track("action_snoozed", access.userId, { type: parsed.data.type });
  revalidateJournalSurfaces(access.accountId);
  return { error: null };
}

export async function dismissJournalAction(input: unknown): Promise<{ error: string | null }> {
  const access = await requireJournalLoopAccess();
  if ("error" in access) return access;
  const parsed = actionInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Action invalide." };
  if (parsed.data.type === "data_checkin" || parsed.data.type === "lead_reminder") return { error: "Cette action ne peut pas être écartée ici." };

  const record = await materializeJournalSource(access.accountId, parsed.data);
  if (!record) return { error: "Cette recommandation n'est plus disponible." };
  const now = new Date();
  await db.update(insightRecords).set({ decision: "dismissed", resumeAt: null, updatedAt: now }).where(and(eq(insightRecords.id, record.id), eq(insightRecords.userId, access.accountId)));
  await db.update(improvementInitiatives).set({ status: "cancelled", lastActivityAt: now, updatedAt: now }).where(and(eq(improvementInitiatives.insightRecordId, record.id), eq(improvementInitiatives.userId, access.accountId)));
  await track("action_dismissed", access.userId, { type: parsed.data.type });
  revalidateJournalSurfaces(access.accountId);
  return { error: null };
}
