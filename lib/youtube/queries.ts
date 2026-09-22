import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { youtubeCardMetrics, youtubeEndScreenMetrics, youtubeVideoInsights, youtubeVideoSnapshots } from "@/db/schema";

export type YoutubeVideoInsightRow = typeof youtubeVideoInsights.$inferSelect;

// Keyed by videoId (== content_posts.externalId for source="youtube" rows)
// so youtube-videos-table.tsx can look up the full-fidelity row for its
// detail dialog without an extra round trip per row. Mirrors
// lib/instagram/queries.ts's getInstagramPostInsightsMap.
export const getYoutubeVideoInsightsMap = cache(async (userId: string): Promise<Map<string, YoutubeVideoInsightRow>> => {
  const rows = await db.select().from(youtubeVideoInsights).where(eq(youtubeVideoInsights.userId, userId));
  return new Map(rows.map((row) => [row.videoId, row]));
});

export const getYoutubeVideoInsight = cache(async (userId: string, videoId: string): Promise<YoutubeVideoInsightRow | null> => {
  const [row] = await db
    .select()
    .from(youtubeVideoInsights)
    .where(and(eq(youtubeVideoInsights.userId, userId), eq(youtubeVideoInsights.videoId, videoId)))
    .limit(1);
  return row ?? null;
});

export type YoutubeVideoSnapshotRow = typeof youtubeVideoSnapshots.$inferSelect;

export const getYoutubeVideoSnapshotsMap = cache(async (userId: string): Promise<Map<string, YoutubeVideoSnapshotRow[]>> => {
  const rows = await db
    .select()
    .from(youtubeVideoSnapshots)
    .where(eq(youtubeVideoSnapshots.userId, userId))
    .orderBy(asc(youtubeVideoSnapshots.capturedOn));
  const result = new Map<string, YoutubeVideoSnapshotRow[]>();
  for (const row of rows) {
    const current = result.get(row.videoId) ?? [];
    current.push(row);
    result.set(row.videoId, current);
  }
  return result;
});

export const getYoutubeVideoSnapshots = cache(async (userId: string, videoId: string): Promise<YoutubeVideoSnapshotRow[]> => {
  return db
    .select()
    .from(youtubeVideoSnapshots)
    .where(and(eq(youtubeVideoSnapshots.userId, userId), eq(youtubeVideoSnapshots.videoId, videoId)))
    .orderBy(asc(youtubeVideoSnapshots.capturedOn));
});

export type YoutubeVideoBingeMetrics = {
  endScreenCtr: number | null;
  cardCtr: number | null;
};

function averageRate(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value !== null && Number.isFinite(value));
  return usable.length === 0 ? null : usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

export const getYoutubeVideoBingeMetricsMap = cache(async (userId: string): Promise<Map<string, YoutubeVideoBingeMetrics>> => {
  const [endScreenRows, cardRows] = await Promise.all([
    db
      .select({ videoId: youtubeEndScreenMetrics.videoId, clickRate: youtubeEndScreenMetrics.clickRate })
      .from(youtubeEndScreenMetrics)
      .where(eq(youtubeEndScreenMetrics.userId, userId)),
    db
      .select({ videoId: youtubeCardMetrics.videoId, clickRate: youtubeCardMetrics.clickRate })
      .from(youtubeCardMetrics)
      .where(eq(youtubeCardMetrics.userId, userId)),
  ]);
  const endScreenRates = new Map<string, number[]>();
  const cardRates = new Map<string, number[]>();
  for (const row of endScreenRows) {
    if (row.clickRate === null) continue;
    endScreenRates.set(row.videoId, [...(endScreenRates.get(row.videoId) ?? []), row.clickRate]);
  }
  for (const row of cardRows) {
    if (row.clickRate === null) continue;
    cardRates.set(row.videoId, [...(cardRates.get(row.videoId) ?? []), row.clickRate]);
  }
  const result = new Map<string, YoutubeVideoBingeMetrics>();
  for (const videoId of new Set([...endScreenRates.keys(), ...cardRates.keys()])) {
    result.set(videoId, {
      endScreenCtr: averageRate(endScreenRates.get(videoId) ?? []),
      cardCtr: averageRate(cardRates.get(videoId) ?? []),
    });
  }
  return result;
});
