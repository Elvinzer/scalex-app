"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { staffMembers, supportTicketEvents, supportTicketMessages, supportTickets } from "@/db/schema";
import { getAdminSupportTicketDetail } from "@/lib/support/queries";
import { sendSupportDiscordReply, sendSupportDiscordTicket } from "@/lib/support/discord";
import { statusAfterStaffPublicReply } from "@/lib/support/lifecycle";
import { requireStaffPermission } from "@/lib/staff/permissions";
import { supportAdminMessageSchema, supportAdminUpdateSchema, supportTicketIdSchema } from "@/lib/support/validation";

type ActionResult = { ok: true } | { ok: false; error: string };

function invalid(): ActionResult {
  return { ok: false, error: "invalid_request" };
}

export async function updateSupportTicketAction(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireStaffPermission();
    const parsed = supportAdminUpdateSchema.safeParse(input);
    if (!parsed.success) return invalid();
    const [current] = await db
      .select({ status: supportTickets.status, priority: supportTickets.priority, assignedStaffId: supportTickets.assignedStaffId, duplicateOfTicketId: supportTickets.duplicateOfTicketId })
      .from(supportTickets)
      .where(eq(supportTickets.id, parsed.data.ticketId))
      .limit(1);
    if (!current) return { ok: false, error: "not_found" };

    if (parsed.data.assignedStaffId) {
      const [assignee] = await db.select({ id: staffMembers.id }).from(staffMembers).where(and(eq(staffMembers.id, parsed.data.assignedStaffId), eq(staffMembers.status, "active"))).limit(1);
      if (!assignee) return { ok: false, error: "invalid_assignee" };
    }

    const nextStatus = parsed.data.status ?? current.status;
    const now = new Date();
    await db
      .update(supportTickets)
      .set({
        status: nextStatus,
        priority: parsed.data.priority ?? current.priority,
        assignedStaffId: parsed.data.assignedStaffId === undefined ? current.assignedStaffId : parsed.data.assignedStaffId,
        duplicateOfTicketId: parsed.data.duplicateOfTicketId === undefined ? current.duplicateOfTicketId : parsed.data.duplicateOfTicketId,
        resolvedAt: nextStatus === "resolved" ? now : current.status === "resolved" ? null : undefined,
        closedAt: nextStatus === "closed" ? now : current.status === "closed" ? null : undefined,
        updatedAt: now,
        lastActivityAt: now,
      })
      .where(eq(supportTickets.id, parsed.data.ticketId));
    await db.insert(supportTicketEvents).values({
      ticketId: parsed.data.ticketId,
      actorUserId: actor.userId,
      staffMemberId: actor.staffMemberId,
      eventType: "ticket_updated",
      previousValue: current,
      newValue: parsed.data,
    });
    revalidatePath("/support");
    revalidatePath(`/support/${parsed.data.ticketId}`);
    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${parsed.data.ticketId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "forbidden" };
  }
}

export async function addSupportMessageAction(input: unknown): Promise<ActionResult> {
  try {
    const actor = await requireStaffPermission();
    const parsed = supportAdminMessageSchema.safeParse(input);
    if (!parsed.success) return invalid();
    const detail = await getAdminSupportTicketDetail(parsed.data.ticketId);
    if (!detail) return { ok: false, error: "not_found" };

    await db.insert(supportTicketMessages).values({
      ticketId: parsed.data.ticketId,
      authorUserId: actor.userId,
      staffMemberId: actor.staffMemberId,
      visibility: parsed.data.visibility,
      body: parsed.data.body,
    });
    const nextStatus = parsed.data.visibility === "public"
      ? statusAfterStaffPublicReply(detail.ticket.status)
      : detail.ticket.status;
    await db
      .update(supportTickets)
      .set({ status: nextStatus, lastActivityAt: new Date(), updatedAt: new Date() })
      .where(eq(supportTickets.id, parsed.data.ticketId));
    await db.insert(supportTicketEvents).values({
      ticketId: parsed.data.ticketId,
      actorUserId: actor.userId,
      staffMemberId: actor.staffMemberId,
      eventType: parsed.data.visibility === "public" ? "public_staff_reply_added" : "internal_note_added",
      previousValue: null,
      newValue: { visibility: parsed.data.visibility, status: nextStatus },
    });

    if (parsed.data.visibility === "public") {
      const discord = await sendSupportDiscordReply({
        reference: detail.ticket.reference,
        ticketId: parsed.data.ticketId,
        requesterName: detail.ticket.requesterName,
        body: parsed.data.body,
      });
      await db.insert(supportTicketEvents).values({
        ticketId: parsed.data.ticketId,
        actorUserId: actor.userId,
        staffMemberId: actor.staffMemberId,
        eventType: discord.status === "sent" ? "discord_staff_reply_notification_sent" : "discord_staff_reply_notification_failed",
        previousValue: null,
        newValue: { status: discord.status, errorCode: discord.status === "failed" ? discord.errorCode : null },
      });
    }

    revalidatePath("/support");
    revalidatePath(`/support/${parsed.data.ticketId}`);
    revalidatePath("/admin/support");
    revalidatePath(`/admin/support/${parsed.data.ticketId}`);
    return { ok: true };
  } catch {
    return { ok: false, error: "forbidden" };
  }
}

export async function retrySupportDiscordAction(ticketId: string): Promise<ActionResult> {
  try {
    const actor = await requireStaffPermission();
    const parsedTicketId = supportTicketIdSchema.safeParse(ticketId);
    if (!parsedTicketId.success) return invalid();
    const detail = await getAdminSupportTicketDetail(parsedTicketId.data);
    if (!detail) return { ok: false, error: "not_found" };
    const discord = await sendSupportDiscordTicket({
      id: detail.ticket.id,
      reference: detail.ticket.reference,
      type: detail.ticket.type,
      title: detail.ticket.title,
      description: detail.ticket.description,
      status: detail.ticket.status,
      priority: detail.ticket.priority,
      requesterName: detail.ticket.requesterName,
      requesterEmail: detail.ticket.requesterEmail,
      accountName: detail.ticket.accountName,
      context: detail.ticket.context,
      hasCapture: detail.attachments.length > 0,
    });
    await db
      .update(supportTickets)
      .set({
        notificationStatus: discord.status === "sent" ? "sent" : discord.status === "failed" ? "failed" : "pending",
        discordMessageId: discord.status === "sent" ? discord.messageId : null,
        discordLastError: discord.status === "failed" ? discord.errorCode : null,
        discordLastAttemptAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(supportTickets.id, parsedTicketId.data));
    await db.insert(supportTicketEvents).values({
      ticketId: parsedTicketId.data,
      actorUserId: actor.userId,
      staffMemberId: actor.staffMemberId,
      eventType: discord.status === "sent" ? "discord_notification_sent" : "discord_notification_failed",
      previousValue: { status: detail.ticket.notificationStatus },
      newValue: { status: discord.status, errorCode: discord.status === "failed" ? discord.errorCode : null },
    });
    revalidatePath(`/admin/support/${parsedTicketId.data}`);
    revalidatePath("/admin/support");
    return { ok: true };
  } catch {
    return { ok: false, error: "forbidden" };
  }
}
