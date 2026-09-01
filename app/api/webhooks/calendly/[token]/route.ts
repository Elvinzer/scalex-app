import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { calendlyConnections, processedCalendlyEvents, salesCalls } from "@/db/schema";
import { fetchInvitee } from "@/lib/calendly/client";
import { classifyCalendlyEvent, parseCalendlyWebhook, readCalendlyInviteePhone } from "@/lib/calendly/events";
import { CALENDLY_SIGNATURE_HEADER } from "@/lib/calendly/protocol";
import { decrypt } from "@/lib/crypto";
import { enqueueCrmCallMatchSuggestions } from "@/lib/crm/call-match-queue";
import { resolveMetaTouchpoint, resolveMetaTouchpointFromIdentifiers, resolveMetaTouchpointFromUtm } from "@/lib/meta-ads/attribution";
import { readMetaTracking } from "@/lib/meta-ads/tracking";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// Calendly webhook receiver. Auth: the [token] path segment resolves + authenticates
// the connection; when a signing key was returned at subscription time, the
// HMAC signature ("Calendly-Webhook-Signature: t=<ts>,v1=<hmac>") is verified on
// top (hmac = HMAC-SHA256(`${t}.${rawBody}`, signingKey)). Idempotent via
// processed_calendly_events keyed on "<event>:<inviteeUri>".

function verifySignature(rawBody: string, signingKey: string, header: string | null): boolean {
  if (!header) return false;
  const parts: Record<string, string> = {};
  for (const piece of header.split(",")) {
    const idx = piece.indexOf("=");
    if (idx > 0) parts[piece.slice(0, idx).trim()] = piece.slice(idx + 1).trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = createHmac("sha256", signingKey).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

function scopedEventId(connectionId: string, eventId: string): string {
  return `${connectionId}:${eventId}`;
}

async function markProcessed(connectionId: string, eventId: string, type: string): Promise<boolean> {
  const [inserted] = await db
    .insert(processedCalendlyEvents)
    .values({ id: scopedEventId(connectionId, eventId), type })
    .onConflictDoNothing({ target: processedCalendlyEvents.id })
    .returning({ id: processedCalendlyEvents.id });
  return Boolean(inserted);
}

async function hasBeenProcessed(connectionId: string, eventId: string): Promise<boolean> {
  const [processed] = await db
    .select({ id: processedCalendlyEvents.id })
    .from(processedCalendlyEvents)
    .where(eq(processedCalendlyEvents.id, scopedEventId(connectionId, eventId)))
    .limit(1);
  return Boolean(processed);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (isRateLimited(`calendly-webhook:${getClientIp(request)}`, 120)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { token } = await params;
  if (!/^[a-f0-9]{48}$/i.test(token)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const [connection] = await db
    .select()
    .from(calendlyConnections)
    .where(eq(calendlyConnections.webhookToken, token))
    .limit(1);
  if (!connection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > 2_000_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const rawBody = await request.text();

  if (connection.webhookSigningKeyEncrypted) {
    let signingKey: string;
    try {
      signingKey = decrypt(connection.webhookSigningKeyEncrypted);
    } catch {
      return NextResponse.json({ error: "Webhook connection unavailable" }, { status: 503 });
    }
    if (!verifySignature(rawBody, signingKey, request.headers.get(CALENDLY_SIGNATURE_HEADER))) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = parseCalendlyWebhook(json);
  if (!parsed) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Idempotency: Calendly has no top-level event id, so key on event + invitee.
  const eventId = `${parsed.eventType}:${parsed.inviteeUri ?? parsed.call?.externalId ?? "unknown"}`;
  if (await hasBeenProcessed(connection.id, eventId)) {
    return NextResponse.json({ received: true });
  }

  try {
    const kind = classifyCalendlyEvent(parsed.eventType);
    let call = parsed.call;
    if (call && kind !== "other" && parsed.inviteeUri) {
      let accessToken: string;
      try {
        accessToken = decrypt(connection.accessTokenEncrypted);
      } catch {
        return NextResponse.json({ error: "Webhook connection unavailable" }, { status: 503 });
      }
      const invitee = await fetchInvitee(accessToken, parsed.inviteeUri);
      if (invitee) {
        const inviteePhone = readCalendlyInviteePhone(invitee);
        const tracking = readMetaTracking(invitee);
        call = {
          ...call,
          ...(inviteePhone ? { inviteePhone } : {}),
          utmSource: call.utmSource ?? tracking.utmSource,
          utmMedium: call.utmMedium ?? tracking.utmMedium,
          utmCampaign: call.utmCampaign ?? tracking.utmCampaign,
          utmContent: call.utmContent ?? tracking.utmContent,
          utmTerm: call.utmTerm ?? tracking.utmTerm,
          metaTouchpointToken: call.metaTouchpointToken ?? tracking.metaTouchpointToken,
          metaCampaignExternalId: call.metaCampaignExternalId ?? tracking.metaCampaignExternalId,
          metaAdSetExternalId: call.metaAdSetExternalId ?? tracking.metaAdSetExternalId,
          metaAdExternalId: call.metaAdExternalId ?? tracking.metaAdExternalId,
        };
      }
    }

    const touchpoint = call
      ? (await resolveMetaTouchpoint(connection.userId, call.metaTouchpointToken)) ??
        (await resolveMetaTouchpointFromIdentifiers({
          userId: connection.userId,
          campaignExternalId: call.metaCampaignExternalId,
          adSetExternalId: call.metaAdSetExternalId,
          adExternalId: call.metaAdExternalId,
        })) ??
        (await resolveMetaTouchpointFromUtm({
          userId: connection.userId,
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

    if (call && kind === "created") {
      await db
        .insert(salesCalls)
        .values({
          userId: connection.userId,
          source: "calendly",
          iclosedCallId: call.externalId,
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
          set: { ...attributionUpdates, updatedAt: new Date() },
        });
    } else if (call && kind === "canceled") {
      await db
        .insert(salesCalls)
        .values({
          userId: connection.userId,
          source: "calendly",
          iclosedCallId: call.externalId,
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
          // Never overwrite a disposition the closer already set (only cancel a
          // still-booked call).
          setWhere: eq(salesCalls.attendance, "booked"),
      });
    }

    if (call) {
      const [storedCall] = await db
        .select({ id: salesCalls.id })
        .from(salesCalls)
        .where(and(eq(salesCalls.userId, connection.userId), eq(salesCalls.iclosedCallId, call.externalId)))
        .limit(1);
      if (storedCall) await enqueueCrmCallMatchSuggestions(connection.userId, [storedCall.id]);
    }

    revalidateBusinessData(connection.userId);
    await markProcessed(connection.id, eventId, parsed.eventType);
  } catch {
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
