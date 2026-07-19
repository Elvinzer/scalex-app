import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { closingVideos } from "@/db/schema";

import type { ClosingVideoInput } from "./schema";
import type { ClosingVideoRow } from "./types";

function toRow(row: typeof closingVideos.$inferSelect): ClosingVideoRow {
  return {
    id: row.id,
    clientName: row.clientName,
    callDate: row.callDate,
    url: row.url,
    transcript: row.transcript,
    notes: row.notes,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getClosingVideos(userId: string): Promise<ClosingVideoRow[]> {
  const rows = await db
    .select()
    .from(closingVideos)
    .where(eq(closingVideos.userId, userId))
    .orderBy(desc(closingVideos.callDate));

  return rows.map(toRow);
}

export async function getClosingVideo(userId: string, id: string): Promise<ClosingVideoRow | null> {
  const [row] = await db
    .select()
    .from(closingVideos)
    .where(and(eq(closingVideos.id, id), eq(closingVideos.userId, userId)))
    .limit(1);

  return row ? toRow(row) : null;
}

export async function createClosingVideo(userId: string, data: ClosingVideoInput): Promise<void> {
  await db.insert(closingVideos).values({ userId, ...data });
}

export async function updateClosingVideo(userId: string, id: string, data: ClosingVideoInput): Promise<void> {
  await db
    .update(closingVideos)
    .set(data)
    .where(and(eq(closingVideos.id, id), eq(closingVideos.userId, userId)));
}

export async function deleteClosingVideo(userId: string, id: string): Promise<void> {
  await db.delete(closingVideos).where(and(eq(closingVideos.id, id), eq(closingVideos.userId, userId)));
}
