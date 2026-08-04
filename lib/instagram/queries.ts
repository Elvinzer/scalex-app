import { eq } from "drizzle-orm";

import { db } from "@/db";
import { instagramPostInsights } from "@/db/schema";

export type InstagramPostInsightRow = typeof instagramPostInsights.$inferSelect;

// Keyed by mediaId (== content_posts.externalId for source="instagram" rows)
// so posts-table.tsx can look up the full-fidelity row for its detail
// dialog without an extra round trip per row.
export async function getInstagramPostInsightsMap(userId: string): Promise<Map<string, InstagramPostInsightRow>> {
  const rows = await db.select().from(instagramPostInsights).where(eq(instagramPostInsights.userId, userId));
  return new Map(rows.map((row) => [row.mediaId, row]));
}
