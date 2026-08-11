"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { businessLevers } from "@/db/schema";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import { getDiscoveryState } from "@/lib/levers/discovery";
import { getLeversCatalog, resolveFromBusinessProfile } from "@/lib/levers/catalog";
import { setLeverStatus } from "@/lib/levers/status";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";
import { revalidateBusinessData } from "@/lib/revalidate-data";

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

  await setLeverStatus(accountId, parsed.data.leverKey, parsed.data.status, parsed.data.stats);

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

  revalidateBusinessData();
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

  revalidateBusinessData();
  return { error: null };
}
