import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { contentPosts } from "@/db/schema";

import type { ContentPostInput } from "./schema";
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
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getContentPosts(userId: string): Promise<ContentPostRow[]> {
  const rows = await db
    .select()
    .from(contentPosts)
    .where(eq(contentPosts.userId, userId))
    .orderBy(desc(contentPosts.publishedAt));

  return rows.map(toRow);
}

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

export async function createContentPost(userId: string, data: ContentPostInput): Promise<void> {
  await db.insert(contentPosts).values({ userId, ...data });
}

export async function updateContentPost(userId: string, id: string, data: ContentPostInput): Promise<void> {
  await db.update(contentPosts).set(data).where(and(eq(contentPosts.id, id), eq(contentPosts.userId, userId)));
}

export async function deleteContentPost(userId: string, id: string): Promise<void> {
  await db.delete(contentPosts).where(and(eq(contentPosts.id, id), eq(contentPosts.userId, userId)));
}
