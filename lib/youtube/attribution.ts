import { and, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { sales, videoAttributions } from "@/db/schema";

import type { AttributionMethod, VideoAttributionTotals } from "./attribution-rules";

export * from "./attribution-rules";

// Which videos are credited for which sales, and — just as importantly —
// whether that credit is trustworthy enough to put a € figure on screen.
//
// The whole Contenu-insights feature leans on one rule: a correlation is
// never rendered as proof. "declared" is the coach telling us at closing
// time; "estimated" is a time-window guess. They are counted separately,
// always, and the UI must show which mix a figure came from.




export async function attributeSaleToVideo(
  userId: string,
  saleId: string,
  videoId: string,
  method: AttributionMethod
): Promise<void> {
  // One attribution per sale (unique index) — re-declaring overwrites rather
  // than double-counting the same sale across two videos.
  await db
    .insert(videoAttributions)
    .values({ userId, saleId, videoId, method })
    .onConflictDoUpdate({
      target: [videoAttributions.userId, videoAttributions.saleId],
      set: { videoId, method },
    });
}

export async function removeSaleAttribution(userId: string, saleId: string): Promise<void> {
  await db.delete(videoAttributions).where(and(eq(videoAttributions.userId, userId), eq(videoAttributions.saleId, saleId)));
}

export async function getSaleAttribution(userId: string, saleId: string): Promise<{ videoId: string; method: AttributionMethod } | null> {
  const [row] = await db
    .select({ videoId: videoAttributions.videoId, method: videoAttributions.method })
    .from(videoAttributions)
    .where(and(eq(videoAttributions.userId, userId), eq(videoAttributions.saleId, saleId)))
    .limit(1);
  return row ?? null;
}

// Per-video revenue, split by how it was attributed. Joins to `sales` for the
// real amount rather than multiplying by an average basket — the actual sale
// price is known, so estimating it would be gratuitous.
export const getVideoAttributionTotals = cache(async (userId: string): Promise<Map<string, VideoAttributionTotals>> => {
  const rows = await db
    .select({
      videoId: videoAttributions.videoId,
      method: videoAttributions.method,
      totalPrice: sales.totalPrice,
    })
    .from(videoAttributions)
    .innerJoin(sales, eq(videoAttributions.saleId, sales.id))
    .where(
      and(
        eq(videoAttributions.userId, userId),
        eq(sales.userId, userId),
        eq(sales.isOrphan, false)
      )
    );

  const totals = new Map<string, VideoAttributionTotals>();
  for (const row of rows) {
    const current =
      totals.get(row.videoId) ??
      { videoId: row.videoId, declaredSales: 0, estimatedSales: 0, declaredRevenueEur: 0, estimatedRevenueEur: 0 };
    if (row.method === "declared") {
      current.declaredSales += 1;
      current.declaredRevenueEur += row.totalPrice;
    } else {
      current.estimatedSales += 1;
      current.estimatedRevenueEur += row.totalPrice;
    }
    totals.set(row.videoId, current);
  }
  return totals;
});
