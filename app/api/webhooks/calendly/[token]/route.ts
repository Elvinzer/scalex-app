import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { calendlyConnections, processedCalendlyEvents, salesCalls } from "@/db/schema";
import { classifyCalendlyEvent, parseCalendlyWebhook } from "@/lib/calendly/events";
import { CALENDLY_SIGNATURE_HEADER } from "@/lib/calendly/protocol";
import { decrypt } from "@/lib/crypto";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

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

async function markProcessed(eventId: string, type: string): Promise<boolean> {
  const [inserted] = await db
    .insert(processedCalendlyEvents)
    .values({ id: eventId, type })
    .onConflictDoNothing({ target: processedCalendlyEvents.id })
    .returning({ id: processedCalendlyEvents.id });
  return Boolean(inserted);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  if (isRateLimited(`calendly-webhook:${getClientIp(request)}`, 120)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { token } = await params;
  const [connection] = await db
    .select()
    .from(calendlyConnections)
    .where(eq(calendlyConnections.webhookToken, token))
    .limit(1);
  if (!connection) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const rawBody = await request.text();

  if (connection.webhookSigningKeyEncrypted) {
    const signingKey = decrypt(connection.webhookSigningKeyEncrypted);
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
  const isNew = await markProcessed(eventId, parsed.eventType);
  if (!isNew) {
    return NextResponse.json({ received: true });
  }

  const call = parsed.call;
  const kind = classifyCalendlyEvent(parsed.eventType);

  if (call && kind === "created") {
    await db
      .insert(salesCalls)
      .values({
        userId: connection.userId,
        source: "calendly",
        iclosedCallId: call.externalId,
        inviteeName: call.inviteeName,
        inviteeEmail: call.inviteeEmail,
        scheduledAt: call.scheduledAt,
        closer: call.closer,
        eventType: call.eventType,
      })
      .onConflictDoNothing({ target: [salesCalls.userId, salesCalls.iclosedCallId] });
  } else if (call && kind === "canceled") {
    await db
      .insert(salesCalls)
      .values({
        userId: connection.userId,
        source: "calendly",
        iclosedCallId: call.externalId,
        inviteeName: call.inviteeName,
        inviteeEmail: call.inviteeEmail,
        scheduledAt: call.scheduledAt,
        closer: call.closer,
        eventType: call.eventType,
        attendance: "cancelled",
      })
      .onConflictDoUpdate({
        target: [salesCalls.userId, salesCalls.iclosedCallId],
        set: { attendance: "cancelled", updatedAt: new Date() },
        // Never overwrite a disposition the closer already set (only cancel a
        // still-booked call).
        setWhere: eq(salesCalls.attendance, "booked"),
      });
  }

  return NextResponse.json({ received: true });
}
