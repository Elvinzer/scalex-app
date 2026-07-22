"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { businessLevers, improvementEvents } from "@/db/schema";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import { getDiscoveryState } from "@/lib/levers/discovery";
import { getLeversCatalog, resolveFromBusinessProfile } from "@/lib/levers/catalog";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

const saveLeverAnswerSchema = z.object({
  leverKey: z.string().min(1),
  status: z.enum(["active", "absent"]), // "not_answered" is never explicitly saved
  stats: z.record(z.string(), z.union([z.number(), z.string()])).default({}),
});

export async function saveLeverAnswer(
  leverKey: string,
  status: "active" | "absent",
  stats: Record<string, number | string>
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = authData.claims.sub as string;
  const access = await requirePermission(userId, "diagnostic");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = saveLeverAnswerSchema.safeParse({ leverKey, status, stats });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Réponse invalide" };
  }

  // First answer of the parcours for this account → discovery_started, once.
  const [existingAny] = await db.select({ id: businessLevers.id }).from(businessLevers).where(eq(businessLevers.userId, accountId)).limit(1);
  if (!existingAny) {
    await track("discovery_started", userId);
  }

  // Read the prior status BEFORE the upsert — businessLevers.status is
  // overwritten in place (no history table), so this is the only moment
  // an "absent/not_answered → active" transition can ever be observed.
  const [priorRow] = await db
    .select({ status: businessLevers.status })
    .from(businessLevers)
    .where(and(eq(businessLevers.userId, accountId), eq(businessLevers.leverKey, parsed.data.leverKey)))
    .limit(1);
  const priorStatus = priorRow?.status ?? "not_answered";

  await db
    .insert(businessLevers)
    .values({ userId: accountId, leverKey: parsed.data.leverKey, status: parsed.data.status, stats: parsed.data.stats, answeredAt: new Date() })
    .onConflictDoUpdate({
      target: [businessLevers.userId, businessLevers.leverKey],
      set: { status: parsed.data.status, stats: parsed.data.stats, answeredAt: new Date(), updatedAt: new Date() },
    });

  // Fires once, the moment the LAST unresolved lever (of the ones that
  // actually need asking — the 4 profile-backed levers are never asked)
  // gets its answer saved.
  const [businessProfile, catalog, answeredRows] = await Promise.all([
    getBusinessProfile(accountId),
    getLeversCatalog(),
    db.select({ leverKey: businessLevers.leverKey }).from(businessLevers).where(eq(businessLevers.userId, accountId)),
  ]);
  const answeredKeys = new Set(answeredRows.map((r) => r.leverKey));
  const stillUnanswered = catalog.some(
    (lever) => !lever.readsFromProfile && resolveFromBusinessProfile(lever.leverKey, businessProfile) === null && !answeredKeys.has(lever.leverKey)
  );
  if (!stillUnanswered) {
    await track("discovery_completed", userId);
  }

  if (priorStatus !== "active" && parsed.data.status === "active") {
    const lever = catalog.find((l) => l.leverKey === parsed.data.leverKey);
    await db.insert(improvementEvents).values({
      userId: accountId,
      date: new Date().toISOString().slice(0, 10),
      type: "lever_activated",
      label: `Levier activé : ${lever?.label ?? parsed.data.leverKey}`,
      sourceId: parsed.data.leverKey,
    });
  }

  revalidatePath("/diagnostic");
  return { error: null };
}

export type DiscoveryProgress = { answered: number; total: number };

export async function getDiscoveryProgress(accountId: string): Promise<DiscoveryProgress> {
  const { answered, total } = await getDiscoveryState(accountId);
  return { answered, total };
}

const updateStatsSchema = z.object({
  leverKey: z.string().min(1),
  stats: z.record(z.string(), z.union([z.number(), z.string()])),
});

// Field-by-field editing after the initial parcours (the brief's "vue
// liste... sans refaire la conversation") — same upsert as saveLeverAnswer,
// just without the discovery_started/discovery_completed bookkeeping since
// the lever is already resolved by definition (only shown for status !== not_answered).
export async function updateLeverStats(leverKey: string, stats: Record<string, number | string>): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = authData.claims.sub as string;
  const access = await requirePermission(userId, "diagnostic");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = updateStatsSchema.safeParse({ leverKey, stats });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  await db
    .update(businessLevers)
    .set({ stats: parsed.data.stats, updatedAt: new Date() })
    .where(and(eq(businessLevers.userId, accountId), eq(businessLevers.leverKey, parsed.data.leverKey)));

  revalidatePath("/diagnostic");
  return { error: null };
}
