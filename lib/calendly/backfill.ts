import { and, desc, eq, isNotNull } from "drizzle-orm";

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

  // Calendly does not always collect a phone (text_reminder_number can be
  // null and questions_and_answers can be empty). If the same contact already
  // exists in another connected source, reuse its phone only on an exact
  // account-scoped email match; never guess from a name.
  const knownPhones = await db
    .select({ email: salesCalls.inviteeEmail, phone: salesCalls.inviteePhone })
    .from(salesCalls)
    .where(and(eq(salesCalls.userId, userId), isNotNull(salesCalls.inviteePhone)))
    .orderBy(desc(salesCalls.updatedAt));
  const phoneByEmail = new Map<string, string>();
  for (const row of knownPhones) {
    const email = row.email?.trim().toLowerCase();
    if (email && row.phone && !phoneByEmail.has(email)) phoneByEmail.set(email, row.phone);
  }

  const enrichedCalls = calls.map((call) => {
    if (call.inviteePhone || !call.inviteeEmail) return call;
    const phone = phoneByEmail.get(call.inviteeEmail.trim().toLowerCase());
    return phone ? { ...call, inviteePhone: phone } : call;
  });

  const inserted = await db
    .insert(salesCalls)
    .values(
      enrichedCalls.map((c) => ({
        userId,
        source: "calendly",
        iclosedCallId: c.externalId,
        inviteeName: c.inviteeName,
        inviteeEmail: c.inviteeEmail,
        inviteePhone: c.inviteePhone,
        scheduledAt: c.scheduledAt,
        durationMinutes: c.durationMinutes,
        closer: c.closer,
        eventType: c.eventType,
        attendance: c.attendance,
      }))
    )
    .onConflictDoNothing({ target: [salesCalls.userId, salesCalls.iclosedCallId] })
    .returning({ id: salesCalls.id });

  // Keep contact enrichment current for calls imported before phone support was
  // added, without touching the closer's manually entered outcome or amounts.
  for (const c of enrichedCalls) {
    if (!c.inviteePhone) continue;
    await db
      .update(salesCalls)
      .set({ inviteePhone: c.inviteePhone, updatedAt: new Date() })
      .where(and(eq(salesCalls.userId, userId), eq(salesCalls.iclosedCallId, c.externalId)));
  }

  return inserted.length;
}
