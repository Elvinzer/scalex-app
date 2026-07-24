import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { businessLevers, improvementEvents } from "@/db/schema";

import { getLeversCatalog } from "./catalog";

export type LeverStatusRow = { status: "active" | "absent" | "not_answered"; stats: Record<string, number | string> };

// Single (account, lever) row — used by Mail/Ads/Upsell to pick their
// Optimiser/Démarrer/Découverte mode. Defaults to "not_answered"/{} when no
// row exists yet, same default the column itself declares.
export async function getLeverStatus(accountId: string, leverKey: string): Promise<LeverStatusRow> {
  const [row] = await db
    .select({ status: businessLevers.status, stats: businessLevers.stats })
    .from(businessLevers)
    .where(and(eq(businessLevers.userId, accountId), eq(businessLevers.leverKey, leverKey)))
    .limit(1);
  return { status: row?.status ?? "not_answered", stats: row?.stats ?? {} };
}

// The reusable core of "activate/deactivate a lever" — upsert businessLevers
// + fire the improvement_events "lever_activated" entry on a genuine
// absent/not_answered → active transition. Extracted from
// app/(app)/diagnostic/discovery-actions.ts's saveLeverAnswer, which keeps
// its own Découverte-only side effects (revalidatePath("/diagnostic"),
// discovery_completed bookkeeping) as a thin wrapper around this — the
// Mail/Ads/Upsell pages call this directly instead, since none of that
// Découverte-parcours bookkeeping applies to them. No permission check here
// (same convention as lib/sales/queries.ts etc.) — callers (the "use server"
// actions) check their own relevant permission before calling this.
export async function setLeverStatus(
  accountId: string,
  leverKey: string,
  status: "active" | "absent",
  stats: Record<string, number | string> = {}
): Promise<{ justActivated: boolean }> {
  const [priorRow] = await db
    .select({ status: businessLevers.status })
    .from(businessLevers)
    .where(and(eq(businessLevers.userId, accountId), eq(businessLevers.leverKey, leverKey)))
    .limit(1);
  const priorStatus = priorRow?.status ?? "not_answered";

  await db
    .insert(businessLevers)
    .values({ userId: accountId, leverKey, status, stats, answeredAt: new Date() })
    .onConflictDoUpdate({
      target: [businessLevers.userId, businessLevers.leverKey],
      set: { status, stats, answeredAt: new Date(), updatedAt: new Date() },
    });

  const justActivated = priorStatus !== "active" && status === "active";
  if (justActivated) {
    const catalog = await getLeversCatalog();
    const lever = catalog.find((l) => l.leverKey === leverKey);
    await db.insert(improvementEvents).values({
      userId: accountId,
      date: new Date().toISOString().slice(0, 10),
      type: "lever_activated",
      label: `Levier activé : ${lever?.label ?? leverKey}`,
      sourceId: leverKey,
    });
  }

  return { justActivated };
}
