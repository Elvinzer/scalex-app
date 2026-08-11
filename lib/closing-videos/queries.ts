import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { closingVideos, salesCalls } from "@/db/schema";

import type { ClosingVideoInput } from "./schema";
import type { ClosingVideoCallOption, ClosingVideoRow } from "./types";

function toRow(row: typeof closingVideos.$inferSelect): ClosingVideoRow {
  return {
    id: row.id,
    salesCallId: row.salesCallId,
    clientName: row.clientName,
    callDate: row.callDate,
    url: row.url,
    transcript: row.transcript,
    notes: row.notes,
    outcome: row.outcome,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getClosingVideoCallOptions(userId: string): Promise<ClosingVideoCallOption[]> {
  const rows = await db
    .select({ id: salesCalls.id, inviteeName: salesCalls.inviteeName, scheduledAt: salesCalls.scheduledAt })
    .from(salesCalls)
    .where(eq(salesCalls.userId, userId))
    .orderBy(desc(salesCalls.scheduledAt));

  return rows.map((row) => ({
    id: row.id,
    label: row.inviteeName?.trim() || "Appel sans nom",
    scheduledAt: row.scheduledAt.toISOString(),
  }));
}

export async function salesCallBelongsToUser(userId: string, salesCallId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: salesCalls.id })
    .from(salesCalls)
    .where(and(eq(salesCalls.id, salesCallId), eq(salesCalls.userId, userId)))
    .limit(1);
  return Boolean(row);
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
