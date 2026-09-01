import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { crmCallLinks, salesCalls } from "@/db/schema";
import { crmCallMatchRequested, inngest } from "@/lib/inngest/client";

export const MAX_QUEUED_CALLS = 25;

export async function getUnlinkedCrmCallIdsForMatching(accountId: string, limit = MAX_QUEUED_CALLS): Promise<string[]> {
  const boundedLimit = Math.max(1, Math.min(limit, MAX_QUEUED_CALLS));
  const rows = await db
    .select({ callId: salesCalls.id })
    .from(salesCalls)
    .leftJoin(crmCallLinks, and(eq(crmCallLinks.salesCallId, salesCalls.id), eq(crmCallLinks.accountId, accountId)))
    .where(and(eq(salesCalls.userId, accountId), isNull(crmCallLinks.id)))
    .orderBy(salesCalls.scheduledAt)
    .limit(boundedLimit);
  return rows.map((row) => row.callId);
}

/**
 * Queue unlinked calls for background matching after an ingestion replay.
 * The worker remains the source of truth for generation and is idempotent by
 * the call fingerprint, so sending the same event twice is safe.
 */
export async function enqueueCrmCallMatchSuggestions(accountId: string, callIds: string[]): Promise<number> {
  const uniqueCallIds = [...new Set(callIds)].slice(0, MAX_QUEUED_CALLS);
  if (uniqueCallIds.length === 0) return 0;

  const rows = await db
    .select({ callId: salesCalls.id })
    .from(salesCalls)
    .leftJoin(crmCallLinks, and(eq(crmCallLinks.salesCallId, salesCalls.id), eq(crmCallLinks.accountId, accountId)))
    .where(and(eq(salesCalls.userId, accountId), inArray(salesCalls.id, uniqueCallIds), isNull(crmCallLinks.id)));
  if (rows.length === 0) return 0;

  let queued = 0;
  for (const row of rows) {
    try {
      await inngest.send(crmCallMatchRequested.create({ accountId, salesCallId: row.callId }));
      queued += 1;
    } catch (error) {
      console.error("crm call match queue failed", { error: error instanceof Error ? error.name : "unknown" });
    }
  }
  return queued;
}
