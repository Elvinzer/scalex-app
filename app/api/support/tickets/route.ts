import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { supportTicketAttachments, supportTicketEvents, supportTickets, users } from "@/db/schema";
import { getAuthIdentity } from "@/lib/auth/request";
import { getAccountContext } from "@/lib/team/context";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { buildSupportTicketContext } from "@/lib/support/context";
import { sendSupportDiscordTicket } from "@/lib/support/discord";
import { createSupportTicketReference } from "@/lib/support/reference";
import {
  SUPPORT_CAPTURE_BUCKET,
  isSupportCaptureMimeType,
} from "@/lib/support/storage";
import { parseOptionalFormText, supportAttachmentSchema, supportTicketInputSchema } from "@/lib/support/validation";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function formString(form: FormData, key: string): string | undefined {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
}

async function getExistingTicket(submittedByUserId: string, idempotencyKey: string) {
  return db
    .select({ id: supportTickets.id, reference: supportTickets.reference })
    .from(supportTickets)
    .where(and(eq(supportTickets.submittedByUserId, submittedByUserId), eq(supportTickets.idempotencyKey, idempotencyKey)))
    .limit(1);
}

export async function POST(request: NextRequest) {
  const identity = await getAuthIdentity();
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isRateLimited(`support-ticket:${identity.userId}:${getClientIp(request)}`, 5, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = supportTicketInputSchema.safeParse({
    idempotencyKey: formString(form, "idempotencyKey"),
    type: formString(form, "type"),
    title: formString(form, "title"),
    description: formString(form, "description"),
    expectedResult: parseOptionalFormText(form.get("expectedResult")),
    observedResult: parseOptionalFormText(form.get("observedResult")),
    reproductionSteps: parseOptionalFormText(form.get("reproductionSteps")),
    impact: parseOptionalFormText(form.get("impact")),
    pathname: formString(form, "pathname"),
    locale: formString(form, "locale"),
    viewportWidth: formString(form, "viewportWidth") || undefined,
    viewportHeight: formString(form, "viewportHeight") || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: "invalid_ticket" }, { status: 400 });

  const context = await getAccountContext(identity.userId);
  if (!context) return NextResponse.json({ error: "account_unavailable" }, { status: 403 });

  const [existing] = await getExistingTicket(identity.userId, parsed.data.idempotencyKey);
  if (existing) return NextResponse.json({ ticketId: existing.id, reference: existing.reference, duplicate: true });

  const userAgent = request.headers.get("user-agent");
  const ticketContext = buildSupportTicketContext({
    pathname: parsed.data.pathname,
    locale: parsed.data.locale,
    viewport: { width: parsed.data.viewportWidth, height: parsed.data.viewportHeight },
    userAgent,
  });
  const details = {
    expectedResult: parsed.data.expectedResult,
    observedResult: parsed.data.observedResult,
    reproductionSteps: parsed.data.reproductionSteps,
    impact: parsed.data.impact,
  };

  const reference = createSupportTicketReference();
  const [ticket] = await db
    .insert(supportTickets)
    .values({
      reference,
      accountId: context.accountId,
      submittedByUserId: identity.userId,
      type: parsed.data.type,
      title: parsed.data.title,
      description: parsed.data.description,
      details,
      context: ticketContext,
      idempotencyKey: parsed.data.idempotencyKey,
    })
    .onConflictDoNothing({ target: [supportTickets.submittedByUserId, supportTickets.idempotencyKey] })
    .returning({ id: supportTickets.id, reference: supportTickets.reference });

  if (!ticket) {
    const [racedTicket] = await getExistingTicket(identity.userId, parsed.data.idempotencyKey);
    if (!racedTicket) return NextResponse.json({ error: "ticket_not_created" }, { status: 500 });
    return NextResponse.json({ ticketId: racedTicket.id, reference: racedTicket.reference, duplicate: true });
  }

  await db.insert(supportTicketEvents).values({
    ticketId: ticket.id,
    actorUserId: identity.userId,
    eventType: "created",
    previousValue: null,
    newValue: { status: "new", type: parsed.data.type },
  });

  const capture = form.get("capture");
  const parsedCapture = capture instanceof File
    ? supportAttachmentSchema.safeParse({ mimeType: capture.type, size: capture.size })
    : null;
  if (capture instanceof File && parsedCapture?.success && isSupportCaptureMimeType(capture.type)) {
    const storagePath = `${context.accountId}/${ticket.id}/${crypto.randomUUID()}`;
    try {
      const supabase = getSupabaseAdminClient();
      const upload = await supabase.storage.from(SUPPORT_CAPTURE_BUCKET).upload(storagePath, Buffer.from(await capture.arrayBuffer()), {
        contentType: capture.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (!upload.error) {
        await db.insert(supportTicketAttachments).values({
          ticketId: ticket.id,
          submittedByUserId: identity.userId,
          storagePath,
          mimeType: capture.type,
          byteSize: capture.size,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
        });
      }
    } catch {
      // A capture is useful context, never a reason to lose the ticket.
    }
  }

  const [account] = await db.select({ displayName: users.displayName, email: users.email }).from(users).where(eq(users.id, context.accountId)).limit(1);
  const [requester] = await db.select({ displayName: users.displayName, email: users.email }).from(users).where(eq(users.id, identity.userId)).limit(1);
  const [attachment] = await db.select({ id: supportTicketAttachments.id }).from(supportTicketAttachments).where(eq(supportTicketAttachments.ticketId, ticket.id)).limit(1);

  const discord = await sendSupportDiscordTicket({
    id: ticket.id,
    reference: ticket.reference,
    type: parsed.data.type,
    title: parsed.data.title,
    description: parsed.data.description,
    status: "new",
    priority: "medium",
    requesterName: requester?.displayName ?? null,
    requesterEmail: requester?.email ?? identity.email ?? "",
    accountName: account?.displayName ?? null,
    context: ticketContext,
    hasCapture: Boolean(attachment),
  });

  if (discord.status === "sent" || discord.status === "failed") {
    await db
      .update(supportTickets)
      .set({
        notificationStatus: discord.status,
        discordMessageId: discord.status === "sent" ? discord.messageId : null,
        discordLastError: discord.status === "failed" ? discord.errorCode : null,
        discordLastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, ticket.id));
    await db.insert(supportTicketEvents).values({
      ticketId: ticket.id,
      actorUserId: identity.userId,
      eventType: discord.status === "sent" ? "discord_notification_sent" : "discord_notification_failed",
      previousValue: { status: "pending" },
      newValue: { status: discord.status, errorCode: discord.status === "failed" ? discord.errorCode : null },
    });
  }

  return NextResponse.json({
    ticketId: ticket.id,
    reference: ticket.reference,
    notification: discord.status,
  });
}
