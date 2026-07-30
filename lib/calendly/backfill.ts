import { db } from "@/db";
import { salesCalls } from "@/db/schema";

import { listScheduledCalls } from "./client";

// Pulls the account's Calendly scheduled events into the funnel (source
// "calendly"). Calendly has no outcome/deal data, so rows land as booked/pending
// and the closer sets the result by hand. Idempotent (onConflictDoNothing on the
// (userId, iclosedCallId) unique index — iclosedCallId holds the event URI).
// Returns the number of newly-inserted calls.
export async function backfillCalendlyCalls(userId: string, token: string, userUri: string): Promise<number> {
  const calls = await listScheduledCalls(token, userUri);
  if (calls.length === 0) return 0;

  const inserted = await db
    .insert(salesCalls)
    .values(
      calls.map((c) => ({
        userId,
        source: "calendly",
        iclosedCallId: c.externalId,
        inviteeName: c.inviteeName,
        inviteeEmail: c.inviteeEmail,
        scheduledAt: c.scheduledAt,
        closer: c.closer,
        eventType: c.eventType,
        attendance: c.attendance,
      }))
    )
    .onConflictDoNothing({ target: [salesCalls.userId, salesCalls.iclosedCallId] })
    .returning({ id: salesCalls.id });

  return inserted.length;
}
