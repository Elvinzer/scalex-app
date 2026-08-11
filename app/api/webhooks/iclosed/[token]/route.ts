import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { iclosedConnections, processedIclosedEvents, salesCalls } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { classifyEvent, parseEnvelope, readCall } from "@/lib/iclosed/events";
import { resolveMetaTouchpoint, resolveMetaTouchpointFromIdentifiers, resolveMetaTouchpointFromUtm } from "@/lib/meta-ads/attribution";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// iClosed webhook receiver. Auth model (iClosed uses static API keys, not
// OAuth, and its public docs don't spell out a signing scheme):
//   1. The [token] path segment is an unguessable per-connection secret
//      (iclosed_connections.webhookToken) — it both resolves WHICH account a
//      delivery belongs to and authenticates it. A wrong/absent token = 404.
//   2. IF iClosed hands us a signing secret at registration time
//      (iclosed_connections.webhookSecretEncrypted), we additionally verify an
//      HMAC-SHA256 signature over the raw body as defense in depth.
//      ⚠️ The header name/format below is a best-effort guess — confirm against
//      the authenticated developer portal and adjust SIGNATURE_HEADER only.
// Idempotent: event.id is checked before acting and written to the ledger only
// after the business write succeeds, so a failed delivery can be retried.

const SIGNATURE_HEADER = "x-iclosed-signature";

function verifySignature(rawBody: string, secret: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const provided = signature.trim().toLowerCase().replace(/^sha256=/, "");
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function markProcessed(eventId: string, type: string): Promise<boolean> {
  const [inserted] = await db
    .insert(processedIclosedEvents)
    .values({ id: eventId, type })
    .onConflictDoNothing({ target: processedIclosedEvents.id })
    .returning({ id: processedIclosedEvents.id });
  return Boolean(inserted);
}

async function hasBeenProcessed(eventId: string): Promise<boolean> {
  const [processed] = await db
    .select({ id: processedIclosedEvents.id })
    .from(processedIclosedEvents)
    .where(eq(processedIclosedEvents.id, eventId))
    .limit(1);
  return Boolean(processed);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  // Rate-limit per IP: a public endpoint, protect against abuse/floods.
  if (isRateLimited(`iclosed-webhook:${getClientIp(request)}`, 120)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { token } = await params;
  if (!/^[a-f0-9]{48}$/i.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [connection] = await db
    .select()
    .from(iclosedConnections)
    .where(eq(iclosedConnections.webhookToken, token))
    .limit(1);
  if (!connection) {
    // Unknown token — don't reveal whether it ever existed.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > 2_000_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const rawBody = await request.text();

  // Optional HMAC layer — only enforced when iClosed gave us a secret.
  if (connection.webhookSecretEncrypted) {
    const secret = decrypt(connection.webhookSecretEncrypted);
    if (!verifySignature(rawBody, secret, request.headers.get(SIGNATURE_HEADER))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const envelope = parseEnvelope(json);
  if (!envelope) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (await hasBeenProcessed(envelope.id)) {
    return NextResponse.json({ received: true });
  }

  try {
  const userId = connection.userId;
  const kind = classifyEvent(envelope.type);
  const call = readCall(envelope as unknown as Record<string, unknown>);
  const touchpoint = call
    ? (await resolveMetaTouchpoint(userId, call.metaTouchpointToken)) ??
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
      }))
    : null;
  const attributionValues = call
    ? {
        utmSource: call.utmSource,
        utmMedium: call.utmMedium,
        utmCampaign: call.utmCampaign,
        utmContent: call.utmContent,
        utmTerm: call.utmTerm,
        metaTouchpointId: touchpoint?.touchpointId ?? null,
      }
    : {};
  const attributionUpdates = {
    ...(call?.utmSource ? { utmSource: call.utmSource } : {}),
    ...(call?.utmMedium ? { utmMedium: call.utmMedium } : {}),
    ...(call?.utmCampaign ? { utmCampaign: call.utmCampaign } : {}),
    ...(call?.utmContent ? { utmContent: call.utmContent } : {}),
    ...(call?.utmTerm ? { utmTerm: call.utmTerm } : {}),
    ...(touchpoint ? { metaTouchpointId: touchpoint.touchpointId } : {}),
  };

  switch (kind) {
    case "booked": {
      if (!call) break;
      await db
        .insert(salesCalls)
        .values({
          userId,
          iclosedCallId: call.iclosedCallId,
          inviteeName: call.inviteeName,
          inviteeEmail: call.inviteeEmail,
          inviteePhone: call.inviteePhone,
          scheduledAt: call.scheduledAt,
          durationMinutes: call.durationMinutes,
          closer: call.closer,
          eventType: call.eventType,
          ...attributionValues,
        })
        // Already booked (replay / backfill overlap) — only enrich tracking;
        // never clobber a disposition the closer may have already set.
        .onConflictDoUpdate({
          target: [salesCalls.userId, salesCalls.iclosedCallId],
          set: { ...attributionUpdates, updatedAt: new Date() },
        });
      break;
    }
    case "rescheduled": {
      if (!call) break;
      // Update the schedule but preserve attendance/outcome. Upsert so a
      // reschedule of a call we never saw still lands.
      await db
        .insert(salesCalls)
        .values({
          userId,
          iclosedCallId: call.iclosedCallId,
          inviteeName: call.inviteeName,
          inviteeEmail: call.inviteeEmail,
          inviteePhone: call.inviteePhone,
          scheduledAt: call.scheduledAt,
          durationMinutes: call.durationMinutes,
          closer: call.closer,
          eventType: call.eventType,
          ...attributionValues,
        })
        .onConflictDoUpdate({
          target: [salesCalls.userId, salesCalls.iclosedCallId],
          set: {
            scheduledAt: call.scheduledAt,
            durationMinutes: call.durationMinutes,
            ...(call.inviteePhone ? { inviteePhone: call.inviteePhone } : {}),
            ...attributionUpdates,
            updatedAt: new Date(),
          },
        });
      break;
    }
    case "cancelled": {
      if (!call) break;
      await db
        .insert(salesCalls)
        .values({
          userId,
          iclosedCallId: call.iclosedCallId,
          inviteeName: call.inviteeName,
          inviteeEmail: call.inviteeEmail,
          inviteePhone: call.inviteePhone,
          scheduledAt: call.scheduledAt,
          durationMinutes: call.durationMinutes,
          closer: call.closer,
          eventType: call.eventType,
          ...attributionValues,
          attendance: "cancelled",
        })
        .onConflictDoUpdate({
          target: [salesCalls.userId, salesCalls.iclosedCallId],
          set: {
            attendance: "cancelled",
            ...(call.inviteePhone ? { inviteePhone: call.inviteePhone } : {}),
            ...attributionUpdates,
            updatedAt: new Date(),
          },
          // Only cancel a still-booked call — never overwrite an attendance/
          // outcome the closer already set by hand (a late cancel shouldn't
          // erase "showed + closed").
          setWhere: eq(salesCalls.attendance, "booked"),
        });
      break;
    }
    default:
      // Unknown/other event (Call Outcome, Transaction Synced, …) — acked and
      // ignored in V1 (outcomes are entered by hand). Already marked processed
      // after the successful switch below so iClosed retries real failures.
      break;
  }

  revalidateBusinessData();
  await markProcessed(envelope.id, envelope.type);
  } catch {
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
