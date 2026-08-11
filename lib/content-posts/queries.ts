import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { contentPosts } from "@/db/schema";

import type { ContentPostCommercialStatsInput } from "./schema";
import type { ContentPostRow } from "./types";

function toRow(row: typeof contentPosts.$inferSelect): ContentPostRow {
  return {
    id: row.id,
    platform: row.platform,
    type: row.type,
    title: row.title,
    publishedAt: row.publishedAt,
    url: row.url,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    shares: row.shares,
    clicks: row.clicks,
    leads: row.leads,
    bookings: row.bookings,
    dealsClosed: row.dealsClosed,
    source: row.source,
    externalId: row.externalId,
    createdAt: row.createdAt.toISOString(),
  };
}

export const getContentPosts = cache(async (userId: string): Promise<ContentPostRow[]> => {
  const rows = await db
    .select()
    .from(contentPosts)
    .where(eq(contentPosts.userId, userId))
    .orderBy(desc(contentPosts.publishedAt));

  return rows.map(toRow);
});

export async function getPostsForMonth(userId: string, year: number, month: number): Promise<ContentPostRow[]> {
  const from = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const to = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

  const rows = await db
    .select()
    .from(contentPosts)
    .where(and(eq(contentPosts.userId, userId), gte(contentPosts.publishedAt, from), lte(contentPosts.publishedAt, to)))
    .orderBy(desc(contentPosts.publishedAt));

  return rows.map(toRow);
}

// Powers the "Datas" month-modal suggestion banner: a leads sum per month
// for the whole year, so switching months in the modal (client-side, no
// refetch) still has a suggestion to show. Never used to auto-fill —
// month-modal.tsx only shows it as a dismissible suggestion.
export async function getPostLeadsSumByMonth(userId: string, year: number): Promise<Record<number, number>> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const rows = await db
    .select({
      month: sql<number>`extract(month from ${contentPosts.publishedAt})::int`,
      leads: sql<number>`coalesce(sum(${contentPosts.leads}), 0)::int`,
    })
    .from(contentPosts)
    .where(and(eq(contentPosts.userId, userId), gte(contentPosts.publishedAt, from), lte(contentPosts.publishedAt, to)))
    .groupBy(sql`extract(month from ${contentPosts.publishedAt})`);

  return Object.fromEntries(rows.map((row) => [row.month, row.leads]));
}

// The one write path onto a synced (non-"manual") row — matched by
// (userId, source, externalId), the same unique index the sync upsert uses
// (contentPosts_user_source_external_idx), so the caller never needs the
// row's own id. Only ever touches bookings/dealsClosed — see
// db/schema.ts's contentPosts comment.
export async function updateContentPostCommercialStats(
  userId: string,
  source: string,
  externalId: string,
  data: ContentPostCommercialStatsInput
): Promise<void> {
  await db
    .update(contentPosts)
    .set(data)
    .where(and(eq(contentPosts.userId, userId), eq(contentPosts.source, source), eq(contentPosts.externalId, externalId)));
}
