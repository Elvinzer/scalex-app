import { createHmac, timingSafeEqual } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { iclosedConnections, processedIclosedEvents, salesCalls } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { classifyEvent, parseEnvelope, readCall } from "@/lib/iclosed/events";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";

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
// Idempotent per CLAUDE.md: event.id is checked against processed_iclosed_events
// before acting (same ledger pattern as the Stripe billing webhook).

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

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  // Rate-limit per IP: a public endpoint, protect against abuse/floods.
  if (isRateLimited(`iclosed-webhook:${getClientIp(request)}`, 120)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { token } = await params;

  const [connection] = await db
    .select()
    .from(iclosedConnections)
    .where(eq(iclosedConnections.webhookToken, token))
    .limit(1);
  if (!connection) {
    // Unknown token — don't reveal whether it ever existed.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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

  const isNew = await markProcessed(envelope.id, envelope.type);
  if (!isNew) {
    return NextResponse.json({ received: true });
  }

  const userId = connection.userId;
  const kind = classifyEvent(envelope.type);
  const call = readCall(envelope as unknown as Record<string, unknown>);

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
          scheduledAt: call.scheduledAt,
          durationMinutes: call.durationMinutes,
          closer: call.closer,
          eventType: call.eventType,
        })
        // Already booked (replay / backfill overlap) — never clobber a
        // disposition the closer may have already set.
        .onConflictDoNothing({ target: [salesCalls.userId, salesCalls.iclosedCallId] });
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
          scheduledAt: call.scheduledAt,
          durationMinutes: call.durationMinutes,
          closer: call.closer,
          eventType: call.eventType,
        })
        .onConflictDoUpdate({
          target: [salesCalls.userId, salesCalls.iclosedCallId],
          set: { scheduledAt: call.scheduledAt, durationMinutes: call.durationMinutes, updatedAt: new Date() },
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
          scheduledAt: call.scheduledAt,
          durationMinutes: call.durationMinutes,
          closer: call.closer,
          eventType: call.eventType,
          attendance: "cancelled",
        })
        .onConflictDoUpdate({
          target: [salesCalls.userId, salesCalls.iclosedCallId],
          set: { attendance: "cancelled", updatedAt: new Date() },
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
      // above so iClosed won't retry it.
      break;
  }

  return NextResponse.json({ received: true });
}
