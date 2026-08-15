import { and, asc, count, desc, eq, gt, ilike, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  staffMembers,
  supportTicketAttachments,
  supportTicketEvents,
  supportTicketMessages,
  supportTickets,
  users,
} from "@/db/schema";
import type {
  SupportQueueFilters,
  SupportTicketPriority,
  SupportTicketStatus,
  SupportTicketType,
} from "@/lib/support/types";

function userAccessCondition(userId: string, accountId: string, isOwner: boolean) {
  return isOwner
    ? eq(supportTickets.accountId, accountId)
    : and(eq(supportTickets.accountId, accountId), eq(supportTickets.submittedByUserId, userId));
}

export async function getUserSupportTickets(input: { userId: string; accountId: string; isOwner: boolean }) {
  return db
    .select({
      id: supportTickets.id,
      reference: supportTickets.reference,
      type: supportTickets.type,
      title: supportTickets.title,
      status: supportTickets.status,
      priority: supportTickets.priority,
      lastActivityAt: supportTickets.lastActivityAt,
      createdAt: supportTickets.createdAt,
    })
    .from(supportTickets)
    .where(userAccessCondition(input.userId, input.accountId, input.isOwner))
    .orderBy(desc(supportTickets.lastActivityAt));
}

export async function getUserSupportTicketDetail(input: {
  ticketId: string;
  userId: string;
  accountId: string;
  isOwner: boolean;
}) {
  const [ticket] = await db
    .select({
      id: supportTickets.id,
      reference: supportTickets.reference,
      type: supportTickets.type,
      title: supportTickets.title,
      description: supportTickets.description,
      details: supportTickets.details,
      status: supportTickets.status,
      priority: supportTickets.priority,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      lastActivityAt: supportTickets.lastActivityAt,
    })
    .from(supportTickets)
    .where(and(eq(supportTickets.id, input.ticketId), userAccessCondition(input.userId, input.accountId, input.isOwner)))
    .limit(1);

  if (!ticket) return null;

  const messages = await db
    .select({
      id: supportTicketMessages.id,
      body: supportTicketMessages.body,
      createdAt: supportTicketMessages.createdAt,
      authorUserId: supportTicketMessages.authorUserId,
      authorName: users.displayName,
    })
    .from(supportTicketMessages)
    .innerJoin(users, eq(users.id, supportTicketMessages.authorUserId))
    .where(and(eq(supportTicketMessages.ticketId, ticket.id), eq(supportTicketMessages.visibility, "public")))
    .orderBy(asc(supportTicketMessages.createdAt));

  const [attachment] = await db
    .select({ id: supportTicketAttachments.id, mimeType: supportTicketAttachments.mimeType })
    .from(supportTicketAttachments)
    .where(eq(supportTicketAttachments.ticketId, ticket.id))
    .limit(1);

  return { ticket, messages, hasAttachment: Boolean(attachment) };
}

export async function getSupportUnseenActivity(input: {
  userId: string;
  accountId: string;
  isOwner: boolean;
  lastSeenAt: Date | null | undefined;
}) {
  const access = input.isOwner
    ? eq(supportTickets.accountId, input.accountId)
    : and(eq(supportTickets.accountId, input.accountId), eq(supportTickets.submittedByUserId, input.userId));
  const since = input.lastSeenAt ?? new Date(0);
  const [row] = await db
    .select({ count: count() })
    .from(supportTickets)
    .where(and(access, gt(supportTickets.lastActivityAt, since), sql`${supportTickets.status} not in ('closed', 'declined')`));
  return Number(row?.count ?? 0) > 0;
}

const accountOwner = alias(users, "support_account_owner");
const requester = alias(users, "support_requester");

function buildQueueConditions(filters: SupportQueueFilters) {
  const conditions = [];
  if (filters.status) conditions.push(eq(supportTickets.status, filters.status));
  if (filters.type) conditions.push(eq(supportTickets.type, filters.type));
  if (filters.priority) conditions.push(eq(supportTickets.priority, filters.priority));
  if (filters.assigned === "unassigned") conditions.push(isNull(supportTickets.assignedStaffId));
  if (filters.assigned === "assigned") conditions.push(sql`${supportTickets.assignedStaffId} is not null`);
  if (filters.search) {
    const search = `%${filters.search.replace(/[%_]/g, "\\$&").slice(0, 100)}%`;
    conditions.push(
      or(
        ilike(supportTickets.reference, search),
        ilike(supportTickets.title, search),
        ilike(accountOwner.displayName, search),
        ilike(accountOwner.email, search),
        ilike(requester.displayName, search),
        ilike(requester.email, search)
      )
    );
  }
  return conditions;
}

export async function getSupportQueue(filters: SupportQueueFilters = {}) {
  return db
    .select({
      id: supportTickets.id,
      reference: supportTickets.reference,
      type: supportTickets.type,
      title: supportTickets.title,
      status: supportTickets.status,
      priority: supportTickets.priority,
      assignedStaffId: supportTickets.assignedStaffId,
      assignedStaffEmail: staffMembers.email,
      accountId: supportTickets.accountId,
      accountName: accountOwner.displayName,
      accountEmail: accountOwner.email,
      requesterName: requester.displayName,
      requesterEmail: requester.email,
      lastActivityAt: supportTickets.lastActivityAt,
      createdAt: supportTickets.createdAt,
      notificationStatus: supportTickets.notificationStatus,
    })
    .from(supportTickets)
    .innerJoin(accountOwner, eq(accountOwner.id, supportTickets.accountId))
    .innerJoin(requester, eq(requester.id, supportTickets.submittedByUserId))
    .leftJoin(staffMembers, eq(staffMembers.id, supportTickets.assignedStaffId))
    .where(buildQueueConditions(filters).length ? and(...buildQueueConditions(filters)) : undefined)
    .orderBy(desc(supportTickets.lastActivityAt));
}

export async function getSupportCounters() {
  const [statusRows, priorityRows] = await Promise.all([
    db.select({ status: supportTickets.status, count: count() }).from(supportTickets).groupBy(supportTickets.status),
    db.select({ priority: supportTickets.priority, count: count() }).from(supportTickets).groupBy(supportTickets.priority),
  ]);
  const status: Record<SupportTicketStatus, number> = {
    new: 0,
    triage: 0,
    in_progress: 0,
    waiting_on_user: 0,
    resolved: 0,
    closed: 0,
    duplicate: 0,
    declined: 0,
  };
  for (const row of statusRows) status[row.status] = Number(row.count);
  const priority = { low: 0, medium: 0, high: 0, blocking: 0 };
  for (const row of priorityRows) priority[row.priority] = Number(row.count);
  return { status, priority };
}

export async function getSupportStaffMembers() {
  return db
    .select({ id: staffMembers.id, email: staffMembers.email, role: staffMembers.role })
    .from(staffMembers)
    .where(eq(staffMembers.status, "active"))
    .orderBy(asc(staffMembers.email));
}

export async function getAdminSupportTicketDetail(ticketId: string) {
  const [ticket] = await db
    .select({
      id: supportTickets.id,
      reference: supportTickets.reference,
      type: supportTickets.type,
      title: supportTickets.title,
      description: supportTickets.description,
      details: supportTickets.details,
      context: supportTickets.context,
      status: supportTickets.status,
      priority: supportTickets.priority,
      assignedStaffId: supportTickets.assignedStaffId,
      duplicateOfTicketId: supportTickets.duplicateOfTicketId,
      notificationStatus: supportTickets.notificationStatus,
      discordLastError: supportTickets.discordLastError,
      discordLastAttemptAt: supportTickets.discordLastAttemptAt,
      accountId: supportTickets.accountId,
      submittedByUserId: supportTickets.submittedByUserId,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      lastActivityAt: supportTickets.lastActivityAt,
      resolvedAt: supportTickets.resolvedAt,
      closedAt: supportTickets.closedAt,
      accountName: accountOwner.displayName,
      accountEmail: accountOwner.email,
      requesterName: requester.displayName,
      requesterEmail: requester.email,
    })
    .from(supportTickets)
    .innerJoin(accountOwner, eq(accountOwner.id, supportTickets.accountId))
    .innerJoin(requester, eq(requester.id, supportTickets.submittedByUserId))
    .where(eq(supportTickets.id, ticketId))
    .limit(1);
  if (!ticket) return null;

  const [messages, events, attachments] = await Promise.all([
    db
      .select({
        id: supportTicketMessages.id,
        body: supportTicketMessages.body,
        visibility: supportTicketMessages.visibility,
        createdAt: supportTicketMessages.createdAt,
        authorName: users.displayName,
        authorEmail: users.email,
      })
      .from(supportTicketMessages)
      .innerJoin(users, eq(users.id, supportTicketMessages.authorUserId))
      .where(eq(supportTicketMessages.ticketId, ticket.id))
      .orderBy(asc(supportTicketMessages.createdAt)),
    db
      .select({
        id: supportTicketEvents.id,
        eventType: supportTicketEvents.eventType,
        previousValue: supportTicketEvents.previousValue,
        newValue: supportTicketEvents.newValue,
        createdAt: supportTicketEvents.createdAt,
        actorName: users.displayName,
        actorEmail: users.email,
      })
      .from(supportTicketEvents)
      .innerJoin(users, eq(users.id, supportTicketEvents.actorUserId))
      .where(eq(supportTicketEvents.ticketId, ticket.id))
      .orderBy(desc(supportTicketEvents.createdAt)),
    db
      .select({ id: supportTicketAttachments.id, storagePath: supportTicketAttachments.storagePath, mimeType: supportTicketAttachments.mimeType })
      .from(supportTicketAttachments)
      .where(eq(supportTicketAttachments.ticketId, ticket.id)),
  ]);

  return { ticket, messages, events, attachments };
}

export type SupportQueueRow = Awaited<ReturnType<typeof getSupportQueue>>[number];
export type SupportAdminTicketDetail = NonNullable<Awaited<ReturnType<typeof getAdminSupportTicketDetail>>>;
export type SupportUserTicketDetail = NonNullable<Awaited<ReturnType<typeof getUserSupportTicketDetail>>>;
export type SupportTicketStatusValue = SupportTicketStatus;
export type SupportTicketPriorityValue = SupportTicketPriority;
export type SupportTicketTypeValue = SupportTicketType;
