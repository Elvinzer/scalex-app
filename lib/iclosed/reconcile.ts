import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { salesCalls } from "@/db/schema";
import { resolveMetaTouchpoint, resolveMetaTouchpointFromIdentifiers, resolveMetaTouchpointFromUtm } from "@/lib/meta-ads/attribution";

import { listUpcomingCalls } from "./client";
import type { NormalizedCall } from "./events";

type AttributedCall = NormalizedCall & { metaTouchpointId: string | null };

// This is deliberately narrower than the initial import: only UPCOMING calls
// are fetched, deal history is not touched, and existing dispositions are
// never overwritten. Webhooks remain the fast path; this job closes the gap
// when a delivery was delayed, misconfigured, or lost.
export type IclosedUpcomingReconciliation = {
  fetched: number;
  inserted: number;
  updated: number;
};

export async function reconcileIclosedUpcomingCalls(
  userId: string,
  apiKey: string,
): Promise<IclosedUpcomingReconciliation> {
  const calls = await listUpcomingCalls(apiKey);
  if (calls.length === 0) return { fetched: 0, inserted: 0, updated: 0 };

  const existingRows = await db
    .select()
    .from(salesCalls)
    .where(
      and(
        eq(salesCalls.userId, userId),
        inArray(
          salesCalls.iclosedCallId,
          calls.map((call) => call.iclosedCallId),
        ),
      ),
    );
  const existingByCallId = new Map(existingRows.map((row) => [row.iclosedCallId, row]));

  const callsWithAttribution = await Promise.all(
    calls.map(async (call) => {
      const fromToken = await resolveMetaTouchpoint(userId, call.metaTouchpointToken);
      const touchpoint =
        fromToken ??
        (await resolveMetaTouchpointFromIdentifiers({
          userId,
          campaignExternalId: call.metaCampaignExternalId,
          adSetExternalId: call.metaAdSetExternalId,
          adExternalId: call.metaAdExternalId,
        })) ??
        (await resolveMetaTouchpointFromUtm({
          userId,
          utmCampaign: call.utmCampaign,
          utmContent: call.utmContent,
        }));
      return { ...call, metaTouchpointId: touchpoint?.touchpointId ?? null };
    }),
  );

  let inserted = 0;
  let updated = 0;

  for (const call of callsWithAttribution) {
    const existing = existingByCallId.get(call.iclosedCallId);
    if (!existing) {
      const [row] = await db
        .insert(salesCalls)
        .values(toInsertValues(userId, call))
        .onConflictDoNothing({ target: [salesCalls.userId, salesCalls.iclosedCallId] })
        .returning({ id: salesCalls.id });
      if (row) inserted += 1;
      continue;
    }

    if (!hasDelta(existing, call)) continue;

    await db
      .update(salesCalls)
      .set(toUpdateValues(call))
      .where(and(eq(salesCalls.userId, userId), eq(salesCalls.iclosedCallId, call.iclosedCallId)));
    updated += 1;
  }

  return { fetched: calls.length, inserted, updated };
}

function toInsertValues(userId: string, call: AttributedCall) {
  return {
    userId,
    iclosedCallId: call.iclosedCallId,
    inviteeName: call.inviteeName,
    inviteeEmail: call.inviteeEmail,
    inviteePhone: call.inviteePhone,
    scheduledAt: call.scheduledAt,
    durationMinutes: call.durationMinutes,
    closer: call.closer,
    eventType: call.eventType,
    source: "iclosed",
    utmSource: call.utmSource,
    utmMedium: call.utmMedium,
    utmCampaign: call.utmCampaign,
    utmContent: call.utmContent,
    utmTerm: call.utmTerm,
    metaTouchpointId: call.metaTouchpointId,
    attendance: call.attendance ?? "booked",
    outcome: call.outcome ?? "pending",
    outcomeSetAt: call.attendance ? new Date() : null,
  };
}

function toUpdateValues(call: AttributedCall) {
  return {
    scheduledAt: call.scheduledAt,
    ...(call.durationMinutes !== null ? { durationMinutes: call.durationMinutes } : {}),
    ...(call.inviteeName ? { inviteeName: call.inviteeName } : {}),
    ...(call.inviteeEmail ? { inviteeEmail: call.inviteeEmail } : {}),
    ...(call.inviteePhone ? { inviteePhone: call.inviteePhone } : {}),
    ...(call.closer ? { closer: call.closer } : {}),
    ...(call.eventType ? { eventType: call.eventType } : {}),
    ...(call.utmSource ? { utmSource: call.utmSource } : {}),
    ...(call.utmMedium ? { utmMedium: call.utmMedium } : {}),
    ...(call.utmCampaign ? { utmCampaign: call.utmCampaign } : {}),
    ...(call.utmContent ? { utmContent: call.utmContent } : {}),
    ...(call.utmTerm ? { utmTerm: call.utmTerm } : {}),
    ...(call.metaTouchpointId ? { metaTouchpointId: call.metaTouchpointId } : {}),
    updatedAt: new Date(),
  };
}

function hasDelta(
  existing: typeof salesCalls.$inferSelect,
  call: AttributedCall,
): boolean {
  return (
    existing.scheduledAt.getTime() !== call.scheduledAt.getTime() ||
    (call.durationMinutes !== null && existing.durationMinutes !== call.durationMinutes) ||
    (call.inviteeName !== null && existing.inviteeName !== call.inviteeName) ||
    (call.inviteeEmail !== null && existing.inviteeEmail !== call.inviteeEmail) ||
    (call.inviteePhone !== null && existing.inviteePhone !== call.inviteePhone) ||
    (call.closer !== null && existing.closer !== call.closer) ||
    (call.eventType !== null && existing.eventType !== call.eventType) ||
    (call.utmSource !== null && existing.utmSource !== call.utmSource) ||
    (call.utmMedium !== null && existing.utmMedium !== call.utmMedium) ||
    (call.utmCampaign !== null && existing.utmCampaign !== call.utmCampaign) ||
    (call.utmContent !== null && existing.utmContent !== call.utmContent) ||
    (call.utmTerm !== null && existing.utmTerm !== call.utmTerm) ||
    (call.metaTouchpointId !== null && existing.metaTouchpointId !== call.metaTouchpointId)
  );
}
