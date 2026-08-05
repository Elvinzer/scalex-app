import { eq } from "drizzle-orm";

import { db } from "@/db";
import { youtubeVideoInsights } from "@/db/schema";

export type YoutubeVideoInsightRow = typeof youtubeVideoInsights.$inferSelect;

// Keyed by videoId (== content_posts.externalId for source="youtube" rows)
// so youtube-videos-table.tsx can look up the full-fidelity row for its
// detail dialog without an extra round trip per row. Mirrors
// lib/instagram/queries.ts's getInstagramPostInsightsMap.
export async function getYoutubeVideoInsightsMap(userId: string): Promise<Map<string, YoutubeVideoInsightRow>> {
  const rows = await db.select().from(youtubeVideoInsights).where(eq(youtubeVideoInsights.userId, userId));
  return new Map(rows.map((row) => [row.videoId, row]));
}
