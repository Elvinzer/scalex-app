import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { supportTicketEvents, supportTicketMessages, supportTickets, users } from "@/db/schema";
import { getAuthIdentity } from "@/lib/auth/request";
import { getAccountContext } from "@/lib/team/context";
import { getClientIp, isRateLimited } from "@/lib/rate-limit";
import { sendSupportDiscordReply } from "@/lib/support/discord";
import { statusAfterUserReply } from "@/lib/support/lifecycle";
import { getUserSupportTicketDetail } from "@/lib/support/queries";
import { supportPublicMessageSchema, supportTicketIdSchema } from "@/lib/support/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const identity = await getAuthIdentity();
  if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (isRateLimited(`support-reply:${identity.userId}:${getClientIp(request)}`, 15, 10 * 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const { ticketId } = await params;
  if (!supportTicketIdSchema.safeParse(ticketId).success) return NextResponse.json({ error: "not_found" }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const parsed = supportPublicMessageSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_message" }, { status: 400 });

  const context = await getAccountContext(identity.userId);
  if (!context) return NextResponse.json({ error: "account_unavailable" }, { status: 403 });
  const detail = await getUserSupportTicketDetail({
    ticketId,
    userId: identity.userId,
    accountId: context.accountId,
    isOwner: context.isOwner,
  });
  if (!detail) return NextResponse.json({ error: "not_found" }, { status: 404 });

  await db.insert(supportTicketMessages).values({
    ticketId,
    authorUserId: identity.userId,
    visibility: "public",
    body: parsed.data.body,
  });
  const nextStatus = statusAfterUserReply(detail.ticket.status);
  await db
    .update(supportTickets)
    .set({ status: nextStatus, lastActivityAt: new Date(), updatedAt: new Date(), resolvedAt: nextStatus === "resolved" ? detail.ticket.updatedAt : null, closedAt: null })
    .where(eq(supportTickets.id, ticketId));
  await db.insert(supportTicketEvents).values({
    ticketId,
    actorUserId: identity.userId,
    eventType: "public_reply_added",
    previousValue: { status: detail.ticket.status },
    newValue: { status: nextStatus },
  });

  const [author] = await db.select({ displayName: users.displayName }).from(users).where(eq(users.id, identity.userId)).limit(1);
  const discord = await sendSupportDiscordReply({
    reference: detail.ticket.reference,
    ticketId,
    requesterName: author?.displayName ?? null,
    body: parsed.data.body,
  });
  await db.insert(supportTicketEvents).values({
    ticketId,
    actorUserId: identity.userId,
    eventType: discord.status === "sent" ? "discord_reply_notification_sent" : "discord_reply_notification_failed",
    previousValue: null,
    newValue: { status: discord.status, errorCode: discord.status === "failed" ? discord.errorCode : null },
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
