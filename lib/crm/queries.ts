import { and, asc, desc, eq, exists, gte, ilike, inArray, isNull, lte, lt, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/db";
import {
  crmActions,
  crmCallLinks,
  crmLeadEvents,
  crmLeadStageHistory,
  crmResponsibilityHistory,
  leadComments,
  leads,
  nativeBookingAvailability,
  nativeBookingEventClosers,
  nativeBookingEvents,
  nativeBookingExceptions,
  nativeBookingQuestions,
  nativeBookings,
  salesCalls,
  sales,
  setters,
  teamMembers,
  users,
} from "@/db/schema";

import { defaultStageAfterReopen, eventForOutcome, eventForStage, legacyStageForCrmStage } from "./machine";
import type { CrmKpiStageChange } from "./kpis";
import type { CrmSaleValidationInput } from "@/lib/sales/schema";
import type {
  CrmActionCategory,
  CrmActionStatus,
  CrmBookingSlotView,
  CrmBookingAvailabilityView,
  CrmActionView,
  CrmCapturedProfile,
  CrmCallView,
  CrmCallMatchSuggestionView,
  CrmCallMatchStatus,
  CrmEventMetadata,
  CrmEventSource,
  CrmEventType,
  CrmLeadDetails,
  CrmLeadEventView,
  CrmLeadListItem,
  CrmLeadOutcome,
  CrmLostReason,
  CrmLeadSource,
  CrmLeadStage,
  CrmProfileResolution,
  CrmResponsibilityHistoryView,
  CrmStageHistoryView,
} from "./types";
import { getCrmCallSuggestions } from "./call-match-suggestions";
import { getNoShowFollowUpDueAt } from "./no-show";
import { createNativeBookingForCrm, type NativeBookingError } from "@/lib/native-booking/booking";
import { listBusyForConnection } from "@/lib/native-booking/calendar";
import { isCalendarTemporarilyUnavailable } from "@/lib/native-booking/calendar-readiness";
import { getCalendarStatesForClosers } from "@/lib/native-booking/settings";
import { generateBookingSlots } from "@/lib/native-booking/slots";
import type { NativeBookingAnswerValue } from "@/lib/native-booking/questions";
import type { PublicBookingRequest } from "@/lib/native-booking/validation";
import { getOrCreateSetterForActor } from "@/lib/setters/queries";

const callSetters = alias(setters, "crm_call_setter");
const leadSetters = alias(setters, "crm_lead_setter");

export type CrmLeadFilters = {
  search?: string;
  platform?: "instagram" | "linkedin";
  stage?: CrmLeadStage;
  outcome?: CrmLeadOutcome;
  responsibleSetterId?: string;
  offerId?: string;
  source?: string;
  createdFrom?: string;
  createdTo?: string;
  overdueActionOnly?: boolean;
  contactState?: "new" | "contacted";
  respondedOnly?: boolean;
  qualificationOnly?: boolean;
  eventType?: CrmEventType;
  eventFrom?: string;
  eventTo?: string;
};

export type CrmActionFilters = {
  category?: CrmActionCategory;
  relanceOnly?: boolean;
  overdueOnly?: boolean;
  responsibleUserId?: string;
  status?: CrmActionStatus;
  dueTodayOnly?: boolean;
};

export type CrmActionPagination = { limit?: number; offset?: number };

export type CrmActionInput = {
  leadId: string;
  category: CrmActionCategory;
  type: string;
  title: string;
  dueAt: Date;
  priority?: number;
  responsibleUserId?: string | null;
  source?: CrmEventSource;
  sourceId?: string | null;
  idempotencyKey?: string | null;
};

export type CrmCallFilters = {
  search?: string;
  unlinkedOnly?: boolean;
  source?: string;
  attendance?: "booked" | "showed" | "no_show" | "cancelled";
  outcome?: "pending" | "closed" | "not_closed" | "awaiting_decision";
  suggestionStatus?: CrmCallMatchStatus;
  from?: string;
  to?: string;
};

type LeadDatabaseRow = typeof leads.$inferSelect;

function leadDisplayName(row: Pick<LeadDatabaseRow, "displayName" | "firstName" | "lastName" | "normalizedHandle">): string {
  return row.displayName?.trim() || [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.normalizedHandle || "Lead";
}

function toLeadItem(
  row: LeadDatabaseRow,
  responsibleSetterName: string | null = null,
  nextCall: CrmLeadListItem["nextCall"] = null,
): CrmLeadListItem {
  return {
    id: row.id,
    accountId: row.accountId,
    platform: row.platform,
    canonicalProfileUrl: row.canonicalProfileUrl,
    normalizedHandle: row.normalizedHandle,
    displayName: leadDisplayName(row),
    firstName: row.firstName,
    lastName: row.lastName,
    source: row.source,
    offerId: row.offerId,
    potentialValueEur: row.potentialValueEur,
    closer: row.closer,
    closerUserId: row.closerUserId,
    saleId: row.saleId,
    stage: row.crmStage,
    contactState: row.contactState,
    outcome: row.crmOutcome,
    isNoShow: row.isNoShow,
    lostReason: row.lostReason,
    respondedAt: row.respondedAt?.toISOString() ?? null,
    qualificationNote: row.qualificationNote,
    email: row.email,
    phone: row.phone,
    responsibleSetterId: row.setterId,
    responsibleSetterName,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messageOccurredAt: row.messageOccurredAt?.toISOString() ?? null,
    capturedAt: row.capturedAt?.toISOString() ?? null,
    nextAction: null,
    nextCall,
  };
}

type NextAction = { id: string; title: string; dueAt: string; category: CrmActionCategory };

async function getNextActions(accountId: string, leadIds: string[]): Promise<Map<string, NextAction>> {
  if (leadIds.length === 0) return new Map();
  const rows = await db
    .select({ id: crmActions.id, leadId: crmActions.leadId, title: crmActions.title, dueAt: crmActions.dueAt, category: crmActions.category })
    .from(crmActions)
    .where(and(eq(crmActions.accountId, accountId), inArray(crmActions.leadId, leadIds), eq(crmActions.status, "open")))
    .orderBy(asc(crmActions.dueAt), desc(crmActions.priority), asc(crmActions.id));
  const result = new Map<string, NextAction>();
  for (const row of rows) {
    if (!result.has(row.leadId)) result.set(row.leadId, { id: row.id, title: row.title, dueAt: row.dueAt.toISOString(), category: row.category });
  }
  return result;
}

async function getNextCalls(accountId: string, leadIds: string[]): Promise<Map<string, CrmLeadListItem["nextCall"]>> {
  if (leadIds.length === 0) return new Map();
  const rows = await db
    .select({ call: salesCalls, link: crmCallLinks })
    .from(salesCalls)
    .innerJoin(crmCallLinks, and(eq(crmCallLinks.salesCallId, salesCalls.id), eq(crmCallLinks.accountId, accountId)))
    .where(and(eq(salesCalls.userId, accountId), inArray(crmCallLinks.leadId, leadIds), gte(salesCalls.scheduledAt, new Date()), ne(salesCalls.attendance, "cancelled")))
    .orderBy(asc(salesCalls.scheduledAt), asc(salesCalls.id));
  const result = new Map<string, CrmLeadListItem["nextCall"]>();
  for (const row of rows) {
    if (!row.link.leadId || result.has(row.link.leadId)) continue;
    result.set(row.link.leadId, {
      id: row.call.id,
      scheduledAt: row.call.scheduledAt.toISOString(),
      timeZone: row.call.timeZone,
      closer: row.call.closer,
      source: row.call.source,
      attendance: row.call.attendance,
      outcome: row.call.outcome,
    });
  }
  return result;
}

function toEventView(row: typeof crmLeadEvents.$inferSelect, actorName: string | null = null): CrmLeadEventView {
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    actorUserId: row.actorUserId,
    occurredAt: row.occurredAt?.toISOString() ?? null,
    capturedAt: row.capturedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    metadata: row.metadata,
    actorName,
  };
}

function toStageHistoryView(row: typeof crmLeadStageHistory.$inferSelect, actorName: string | null = null, responsibleSetterName: string | null = null): CrmStageHistoryView {
  return {
    id: row.id,
    fromStage: row.fromStage,
    toStage: row.toStage,
    actorUserId: row.actorUserId,
    responsibleSetterId: row.responsibleSetterId,
    source: row.source,
    changedAt: row.changedAt.toISOString(),
    actorName,
    responsibleSetterName,
  };
}

function toResponsibilityHistoryView(row: typeof crmResponsibilityHistory.$inferSelect): CrmResponsibilityHistoryView {
  return {
    id: row.id,
    previousSetterId: row.previousSetterId,
    nextSetterId: row.nextSetterId,
    actorUserId: row.actorUserId,
    changedAt: row.changedAt.toISOString(),
  };
}

function actionLeadName(row: { displayName: string | null; firstName: string; lastName: string; normalizedHandle: string | null }): string {
  return row.displayName?.trim() || [row.firstName, row.lastName].filter(Boolean).join(" ").trim() || row.normalizedHandle || "Lead";
}

function toActionView(row: {
  action: typeof crmActions.$inferSelect;
  lead: { displayName: string | null; firstName: string; lastName: string; normalizedHandle: string | null };
  responsible: { id: string; displayName: string | null; email: string } | null;
  nextCall?: CrmActionView["nextCall"];
}): CrmActionView {
  return {
    id: row.action.id,
    leadId: row.action.leadId,
    leadName: actionLeadName(row.lead),
    category: row.action.category,
    type: row.action.type,
    title: row.action.title,
    dueAt: row.action.dueAt.toISOString(),
    status: row.action.status,
    priority: row.action.priority,
    responsibleUserId: row.action.responsibleUserId,
    responsibleName: row.responsible?.displayName || row.responsible?.email || null,
    createdByUserId: row.action.createdByUserId,
    completedAt: row.action.completedAt?.toISOString() ?? null,
    completedByUserId: row.action.completedByUserId,
    source: row.action.source,
    sourceId: row.action.sourceId,
    nextCall: row.nextCall ?? null,
  };
}

function toCallView(row: {
  call: typeof salesCalls.$inferSelect;
  link: typeof crmCallLinks.$inferSelect | null;
  lead: LeadDatabaseRow | null;
  setterName?: string | null;
  suggestion?: CrmCallMatchSuggestionView | null;
}): CrmCallView {
  return {
    id: row.call.id,
    leadId: row.link?.leadId ?? null,
    leadName: row.lead ? leadDisplayName(row.lead) : null,
    leadProfileUrl: row.lead?.canonicalProfileUrl ?? null,
    source: row.call.source,
    inviteeName: row.call.inviteeName,
    inviteeEmail: row.call.inviteeEmail,
    inviteePhone: row.call.inviteePhone,
    scheduledAt: row.call.scheduledAt.toISOString(),
    eventTimeZone: row.call.timeZone,
    durationMinutes: row.call.durationMinutes,
    eventType: row.call.eventType,
    externalReference: row.call.iclosedCallId,
    nativeBookingId: row.call.nativeBookingId,
    attendance: row.call.attendance,
    outcome: row.call.outcome,
    closer: row.call.closer,
    confidence: row.link?.confidence ?? null,
    responsibleName: row.setterName ?? null,
    suggestion: row.suggestion ?? null,
  };
}

function eventValues(input: {
  accountId: string;
  leadId: string;
  actorUserId: string | null;
  type: CrmEventType;
  source: CrmEventSource;
  sourceEventKey?: string | null;
  occurredAt?: Date | null;
  capturedAt?: Date | null;
  metadata?: CrmEventMetadata;
}) {
  return {
    accountId: input.accountId,
    leadId: input.leadId,
    actorUserId: input.actorUserId,
    type: input.type,
    source: input.source,
    sourceEventKey: input.sourceEventKey ?? null,
    occurredAt: input.occurredAt ?? null,
    capturedAt: input.capturedAt ?? null,
    metadata: input.metadata ?? {},
  };
}

async function getSetterForAccount(accountId: string, setterId: string | null | undefined) {
  if (!setterId) return null;
  const [setter] = await db.select().from(setters).where(and(eq(setters.id, setterId), eq(setters.userId, accountId))).limit(1);
  return setter ?? null;
}

export async function getCrmSetterForActor(accountId: string, actorUserId: string): Promise<{ id: string; name: string } | null> {
  const [setter] = await db
    .select({ id: setters.id, name: setters.name })
    .from(setters)
    .innerJoin(users, eq(setters.email, users.email))
    .where(and(eq(setters.userId, accountId), eq(users.id, actorUserId), eq(setters.active, true)))
    .limit(1);
  return setter ?? null;
}

export async function getCrmSetters(accountId: string): Promise<Array<{ id: string; userId: string; name: string; active: boolean }>> {
  return db
    .select({ id: setters.id, userId: setters.userId, name: setters.name, active: setters.active })
    .from(setters)
    .where(eq(setters.userId, accountId))
    .orderBy(asc(setters.name));
}

export type CrmLeadPagination = { limit?: number; offset?: number };

export async function getCrmLeads(accountId: string, filters: CrmLeadFilters = {}, pagination: CrmLeadPagination = {}): Promise<CrmLeadListItem[]> {
  const conditions = [eq(leads.accountId, accountId)];
  if (filters.platform) conditions.push(eq(leads.platform, filters.platform));
  if (filters.stage) conditions.push(eq(leads.crmStage, filters.stage));
  if (filters.outcome) conditions.push(eq(leads.crmOutcome, filters.outcome));
  if (filters.contactState) conditions.push(eq(leads.contactState, filters.contactState));
  if (filters.respondedOnly) conditions.push(sql`${leads.respondedAt} is not null`);
  if (filters.qualificationOnly) conditions.push(sql`${leads.qualificationNote} is not null and length(trim(${leads.qualificationNote})) > 0`);
  if (filters.eventType) {
    const eventConditions = [
      eq(crmLeadEvents.accountId, accountId),
      eq(crmLeadEvents.leadId, leads.id),
      eq(crmLeadEvents.type, filters.eventType),
    ];
    if (filters.eventFrom && !Number.isNaN(Date.parse(filters.eventFrom))) eventConditions.push(gte(sql`coalesce(${crmLeadEvents.occurredAt}, ${crmLeadEvents.createdAt})`, new Date(`${filters.eventFrom}T00:00:00.000Z`).toISOString()));
    if (filters.eventTo && !Number.isNaN(Date.parse(filters.eventTo))) eventConditions.push(lte(sql`coalesce(${crmLeadEvents.occurredAt}, ${crmLeadEvents.createdAt})`, new Date(`${filters.eventTo}T23:59:59.999Z`).toISOString()));
    conditions.push(exists(db.select({ id: crmLeadEvents.id }).from(crmLeadEvents).where(and(...eventConditions))));
  }
  if (filters.responsibleSetterId) conditions.push(eq(leads.setterId, filters.responsibleSetterId));
  if (filters.offerId) conditions.push(eq(leads.offerId, filters.offerId));
  if (filters.source) conditions.push(eq(leads.source, filters.source as typeof leads.source.enumValues[number]));
  if (filters.createdFrom) conditions.push(gte(leads.createdAt, new Date(`${filters.createdFrom}T00:00:00.000Z`)));
  if (filters.createdTo) conditions.push(lte(leads.createdAt, new Date(`${filters.createdTo}T23:59:59.999Z`)));
  if (filters.overdueActionOnly) {
    conditions.push(exists(db.select({ id: crmActions.id }).from(crmActions).where(and(eq(crmActions.accountId, accountId), eq(crmActions.leadId, leads.id), eq(crmActions.status, "open"), lt(crmActions.dueAt, new Date())))));
  }
  if (filters.search) {
    const pattern = `%${filters.search}%`;
    conditions.push(or(ilike(leads.displayName, pattern), ilike(leads.firstName, pattern), ilike(leads.lastName, pattern), ilike(leads.normalizedHandle, pattern)) ?? eq(leads.id, "00000000-0000-0000-0000-000000000000"));
  }

  const limit = Math.min(Math.max(pagination.limit ?? 100, 1), 100);
  const offset = Math.max(pagination.offset ?? 0, 0);
  const rows = await db
    .select({ lead: leads, setterName: setters.name })
    .from(leads)
    .leftJoin(setters, eq(leads.setterId, setters.id))
    .where(and(...conditions))
    .orderBy(desc(leads.updatedAt), asc(leads.id))
    .limit(limit)
    .offset(offset);
  const nextActions = await getNextActions(accountId, rows.map(({ lead }) => lead.id));
  const nextCalls = await getNextCalls(accountId, rows.map(({ lead }) => lead.id));
  return rows.map(({ lead, setterName }) => ({ ...toLeadItem(lead, setterName, nextCalls.get(lead.id) ?? null), nextAction: nextActions.get(lead.id) ?? null }));
}

export async function getCrmLead(accountId: string, leadId: string): Promise<CrmLeadDetails | null> {
  const [row] = await db
    .select({ lead: leads, setterName: setters.name })
    .from(leads)
    .leftJoin(setters, eq(leads.setterId, setters.id))
    .where(and(eq(leads.id, leadId), eq(leads.accountId, accountId)))
    .limit(1);
  if (!row) return null;

  const [comments, events, stageHistory, responsibilityHistory, actions, calls] = await Promise.all([
    db.select({ comment: leadComments, author: { displayName: users.displayName, email: users.email } }).from(leadComments).innerJoin(leads, and(eq(leadComments.leadId, leads.id), eq(leads.accountId, accountId))).leftJoin(users, eq(leadComments.userId, users.id)).where(eq(leadComments.leadId, leadId)).orderBy(asc(leadComments.createdAt)),
    db.select({ event: crmLeadEvents, actor: { displayName: users.displayName, email: users.email } }).from(crmLeadEvents).leftJoin(users, eq(crmLeadEvents.actorUserId, users.id)).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, leadId))).orderBy(asc(crmLeadEvents.createdAt)),
    db.select({ history: crmLeadStageHistory, actor: { displayName: users.displayName, email: users.email }, setterName: setters.name }).from(crmLeadStageHistory).leftJoin(users, eq(crmLeadStageHistory.actorUserId, users.id)).leftJoin(setters, eq(crmLeadStageHistory.responsibleSetterId, setters.id)).where(and(eq(crmLeadStageHistory.accountId, accountId), eq(crmLeadStageHistory.leadId, leadId))).orderBy(asc(crmLeadStageHistory.changedAt)),
    db.select().from(crmResponsibilityHistory).where(and(eq(crmResponsibilityHistory.accountId, accountId), eq(crmResponsibilityHistory.leadId, leadId))).orderBy(asc(crmResponsibilityHistory.changedAt)),
    getCrmActions(accountId, { status: undefined, responsibleUserId: undefined, leadId }),
    getCrmCalls(accountId, leadId),
  ]);

  return {
    ...toLeadItem(row.lead, row.setterName, calls.find((call) => call.attendance !== "cancelled" && new Date(call.scheduledAt).getTime() >= Date.now()) ? (() => {
      const nextCall = calls.find((call) => call.attendance !== "cancelled" && new Date(call.scheduledAt).getTime() >= Date.now());
      return nextCall ? { id: nextCall.id, scheduledAt: nextCall.scheduledAt, timeZone: nextCall.eventTimeZone, closer: nextCall.closer, source: nextCall.source, attendance: nextCall.attendance, outcome: nextCall.outcome } : null;
    })() : null),
    nextAction: (await getNextActions(accountId, [leadId])).get(leadId) ?? null,
    comments: comments.map(({ comment, author }) => ({ id: comment.id, userId: comment.userId, body: comment.body, createdAt: comment.createdAt.toISOString(), authorName: author?.displayName || author?.email || null })),
    events: events.map(({ event, actor }) => toEventView(event, actor?.displayName || actor?.email || null)),
    stageHistory: stageHistory.map(({ history, actor, setterName }) => toStageHistoryView(history, actor?.displayName || actor?.email || null, setterName)),
    responsibilityHistory: responsibilityHistory.map(toResponsibilityHistoryView),
    actions,
    calls,
  };
}

export async function resolveCrmProfile(accountId: string, captured: CrmCapturedProfile): Promise<CrmProfileResolution> {
  // Both predicates use dedicated account-scoped indexes. Running them in
  // parallel removes one database round trip from the extension's critical
  // path while preserving the exact-URL priority below.
  const [exactResult, candidatesResult] = await Promise.allSettled([
    db
      .select({ lead: leads, setterName: setters.name })
      .from(leads)
      .leftJoin(setters, eq(leads.setterId, setters.id))
      .where(and(eq(leads.accountId, accountId), eq(leads.platform, captured.platform), eq(leads.canonicalProfileUrl, captured.canonicalProfileUrl)))
      .limit(1),
    db
      .select({ lead: leads, setterName: setters.name })
      .from(leads)
      .leftJoin(setters, eq(leads.setterId, setters.id))
      .where(and(eq(leads.accountId, accountId), eq(leads.platform, captured.platform), eq(leads.normalizedHandle, captured.normalizedHandle)))
      .orderBy(desc(leads.updatedAt), asc(leads.id)),
  ]);
  if (exactResult.status === "rejected") throw exactResult.reason;
  const exact = exactResult.value[0];
  if (exact) return { kind: "known", lead: toLeadItem(exact.lead, exact.setterName) };

  if (candidatesResult.status === "rejected") throw candidatesResult.reason;
  const candidates = candidatesResult.value;
  const candidateItems = candidates.map(({ lead, setterName }) => toLeadItem(lead, setterName));
  if (candidateItems.length > 0) return { kind: "ambiguous", profile: captured, candidates: candidateItems };
  return { kind: "unknown", profile: captured };
}

export type CreateCrmLeadInput = {
  profile: CrmCapturedProfile;
  actorUserId: string;
  offerId?: string | null;
  marketingSource?: CrmLeadSource;
  stage?: CrmLeadStage;
  responsibleSetterId?: string | null;
  email?: string | null;
  phone?: string | null;
  closerUserId?: string | null;
  source: CrmEventSource;
  sourceEventKey?: string | null;
  idempotencyKey?: string | null;
};

export async function createCrmLead(accountId: string, input: CreateCrmLeadInput): Promise<{ lead: CrmLeadListItem; created: boolean }> {
  const setter = input.responsibleSetterId
    ? await getSetterForAccount(accountId, input.responsibleSetterId)
    : await getOrCreateSetterForActor(accountId, input.actorUserId);
  if (input.responsibleSetterId && !setter) throw new Error("Le responsable n'appartient pas à ce compte.");
  const setterId = setter?.id ?? null;
  const capturedAt = new Date(input.profile.capturedAt);
  const messageDate = input.profile.messageOccurredAt ? new Date(input.profile.messageOccurredAt) : null;
  const stage = input.stage ?? "first_message_sent";
  const createdMessageDate = messageDate ?? (stage === "first_message_sent" ? capturedAt : null);
  const contactState = createdMessageDate || stage !== "first_message_sent" ? "contacted" as const : "new" as const;
  const captureKey = input.idempotencyKey ?? input.sourceEventKey ?? `capture:${input.profile.platform}:${input.profile.canonicalProfileUrl}:${input.profile.capturedAt}`;

  return db.transaction(async (tx) => {
    const [idempotent] = await tx
      .select({ event: crmLeadEvents, lead: leads })
      .from(crmLeadEvents)
      .innerJoin(leads, and(eq(crmLeadEvents.leadId, leads.id), eq(leads.accountId, accountId)))
      .where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.type, "lead_created"), eq(crmLeadEvents.sourceEventKey, captureKey)))
      .limit(1);
    if (idempotent) {
      if (idempotent.lead.platform !== input.profile.platform || idempotent.lead.canonicalProfileUrl !== input.profile.canonicalProfileUrl) throw new Error("CRM_IDEMPOTENCY_CONFLICT");
      return { lead: toLeadItem(idempotent.lead, setter?.name ?? null), created: false };
    }

    const [existing] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.accountId, accountId), eq(leads.platform, input.profile.platform), eq(leads.canonicalProfileUrl, input.profile.canonicalProfileUrl)))
      .limit(1);

    if (existing) {
      const [updated] = await tx
        .update(leads)
        .set({
          displayName: input.profile.displayName,
          socialFirstName: input.profile.firstName,
          socialLastName: input.profile.lastName || null,
          normalizedHandle: input.profile.normalizedHandle,
          messageOccurredAt: messageDate ?? existing.messageOccurredAt,
          ...(input.email !== undefined ? { email: input.email } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.closerUserId !== undefined ? { closerUserId: input.closerUserId } : {}),
          ...(messageDate ? { contactState: "contacted" as const } : {}),
          capturedAt,
          updatedAt: new Date(),
        })
        .where(and(eq(leads.id, existing.id), eq(leads.accountId, accountId)))
        .returning();
      await tx.insert(crmLeadEvents).values(eventValues({
        accountId,
        leadId: existing.id,
        actorUserId: input.actorUserId,
        type: "profile_captured",
        source: input.source,
        sourceEventKey: `${captureKey}:profile`,
        occurredAt: messageDate,
        capturedAt,
        metadata: { platform: input.profile.platform, handle: input.profile.normalizedHandle, mode: "known" },
      })).onConflictDoNothing();
      return { lead: toLeadItem(updated ?? existing, setter?.name ?? null), created: false };
    }

    const [created] = await tx.insert(leads).values({
      userId: accountId,
      accountId,
      firstName: input.profile.firstName || input.profile.normalizedHandle,
      lastName: input.profile.lastName,
      email: input.email ?? null,
      phone: input.phone ?? null,
      source: input.marketingSource ?? input.profile.platform,
      platform: input.profile.platform,
      canonicalProfileUrl: input.profile.canonicalProfileUrl,
      normalizedHandle: input.profile.normalizedHandle,
      displayName: input.profile.displayName,
      socialFirstName: input.profile.firstName,
      socialLastName: input.profile.lastName || null,
      offerId: input.offerId ?? null,
      setterId,
      closerUserId: input.closerUserId ?? null,
      stage: legacyStageForCrmStage(stage),
      crmStage: stage,
      contactState,
      crmOutcome: "none",
      messageOccurredAt: createdMessageDate,
      capturedAt,
      updatedAt: new Date(),
    }).returning();

    await tx.insert(crmLeadStageHistory).values({
      accountId,
      leadId: created.id,
      fromStage: null,
      toStage: stage,
      actorUserId: input.actorUserId,
      responsibleSetterId: setterId,
      source: input.source,
      changedAt: createdMessageDate ?? capturedAt,
    });
    await tx.insert(crmLeadEvents).values([
      eventValues({ accountId, leadId: created.id, actorUserId: input.actorUserId, type: "lead_created", source: input.source, sourceEventKey: captureKey, capturedAt, metadata: { platform: input.profile.platform } }),
      eventValues({ accountId, leadId: created.id, actorUserId: input.actorUserId, type: "profile_captured", source: input.source, sourceEventKey: `${captureKey}:profile`, occurredAt: messageDate, capturedAt, metadata: { platform: input.profile.platform, handle: input.profile.normalizedHandle, mode: "unknown" } }),
      eventValues({ accountId, leadId: created.id, actorUserId: input.actorUserId, type: eventForStage(stage), source: input.source, sourceEventKey: `${captureKey}:stage`, occurredAt: stage === "first_message_sent" ? createdMessageDate : capturedAt, capturedAt, metadata: { selectedAtCapture: true, responsibleSetterId: setterId } }),
    ]).onConflictDoNothing();
    return { lead: toLeadItem(created, setter?.name ?? null), created: true };
  });
}

export async function validateCrmSale(
  accountId: string,
  leadId: string,
  input: CrmSaleValidationInput,
  actorUserId: string,
): Promise<{ saleId: string; alreadyValidated: boolean } | null> {
  return db.transaction(async (tx) => {
    const [lead] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.accountId, accountId)))
      .for("update")
      .limit(1);
    if (!lead) return null;

    const eventKey = `sale:${input.idempotencyKey}`;
    const [existingEvent] = await tx
      .select({ metadata: crmLeadEvents.metadata })
      .from(crmLeadEvents)
      .where(
        and(
          eq(crmLeadEvents.accountId, accountId),
          eq(crmLeadEvents.leadId, leadId),
          eq(crmLeadEvents.type, "sale_validated"),
          eq(crmLeadEvents.sourceEventKey, eventKey),
        ),
      )
      .limit(1);
    if (existingEvent) {
      const saleId = existingEvent.metadata.saleId;
      if (typeof saleId !== "string") throw new Error("CRM_SALE_IDEMPOTENCY_CORRUPT");
      if (existingEvent.metadata.totalPrice !== input.totalPrice || existingEvent.metadata.saleDate !== input.saleDate) {
        throw new Error("CRM_IDEMPOTENCY_CONFLICT");
      }
      return { saleId, alreadyValidated: true };
    }

    if (lead.saleId) throw new Error("CRM_SALE_ALREADY_VALIDATED");

    const [existingSale] = await tx
      .select({ id: sales.id })
      .from(sales)
      .where(and(eq(sales.userId, accountId), eq(sales.leadId, leadId), sql`${sales.parentSaleId} is null`))
      .orderBy(desc(sales.createdAt))
      .limit(1);

    const saleId = existingSale?.id ?? (await (async () => {
      const saleInput = {
        clientName: input.clientName,
        clientEmail: input.clientEmail,
        sourceChannel: input.sourceChannel,
        offerId: input.offerId,
        totalPrice: input.totalPrice,
        paymentType: input.paymentType,
        paymentMethod: input.paymentMethod,
        installments: input.installments,
        saleDate: input.saleDate,
        closer: input.closer,
        hasUpsell: input.hasUpsell,
        upsellOfferId: input.upsellOfferId,
        upsellAmount: input.upsellAmount,
        setterId: input.setterId,
      };
      const [createdSale] = await tx
        .insert(sales)
        .values({ userId: accountId, ...saleInput, leadId })
        .returning({ id: sales.id });
      return createdSale.id;
    })());

    const now = new Date();
    const [updatedLead] = await tx
      .update(leads)
      .set({ saleId, crmOutcome: "sold", isNoShow: false, updatedAt: now })
      .where(and(eq(leads.id, leadId), eq(leads.accountId, accountId)))
      .returning({ id: leads.id });
    if (!updatedLead) return null;

    await tx
      .insert(crmLeadEvents)
      .values(
        eventValues({
          accountId,
          leadId,
          actorUserId,
          type: "sale_validated",
          source: "app",
          sourceEventKey: eventKey,
          occurredAt: now,
          capturedAt: now,
          metadata: {
            saleId,
            totalPrice: input.totalPrice,
            saleDate: input.saleDate,
            offerId: input.offerId,
            setterId: input.setterId,
            closer: input.closer,
            responsibleSetterId: lead.setterId,
          },
        }),
      )
      .onConflictDoNothing();

    return { saleId, alreadyValidated: Boolean(existingSale) };
  });
}

export async function updateCrmLeadFields(
  accountId: string,
  leadId: string,
  fields: { displayName?: string; firstName?: string; lastName?: string; offerId?: string | null; source?: CrmLeadSource; potentialValueEur?: number; closer?: string | null; closerUserId?: string | null; email?: string | null; phone?: string | null },
  actorUserId: string,
  source: CrmEventSource = "app",
  idempotencyKey?: string | null,
): Promise<CrmLeadListItem | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    if (!current) return null;
    const eventKey = idempotencyKey ? `fields:${idempotencyKey}` : null;
    if (eventKey) {
      const [existingEvent] = await tx.select({ id: crmLeadEvents.id }).from(crmLeadEvents).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, leadId), eq(crmLeadEvents.type, "profile_captured"), eq(crmLeadEvents.sourceEventKey, eventKey))).limit(1);
      if (existingEvent) return toLeadItem(current);
    }
    const [updated] = await tx.update(leads).set({
      ...(fields.displayName !== undefined ? { displayName: fields.displayName } : {}),
      ...(fields.firstName !== undefined ? { firstName: fields.firstName, socialFirstName: fields.firstName } : {}),
      ...(fields.lastName !== undefined ? { lastName: fields.lastName, socialLastName: fields.lastName || null } : {}),
      ...(fields.offerId !== undefined ? { offerId: fields.offerId } : {}),
      ...(fields.source !== undefined ? { source: fields.source } : {}),
      ...(fields.potentialValueEur !== undefined ? { potentialValueEur: fields.potentialValueEur } : {}),
      ...(fields.closer !== undefined ? { closer: fields.closer } : {}),
      ...(fields.closerUserId !== undefined ? { closerUserId: fields.closerUserId } : {}),
      ...(fields.email !== undefined ? { email: fields.email } : {}),
      ...(fields.phone !== undefined ? { phone: fields.phone } : {}),
      updatedAt: new Date(),
    }).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).returning();
    if (!updated) return null;
    await tx.insert(crmLeadEvents).values(eventValues({
      accountId,
      leadId,
      actorUserId,
      type: "profile_captured",
      source,
      sourceEventKey: eventKey,
      capturedAt: new Date(),
      metadata: { operation: "fields_updated", fields: Object.keys(fields).join(",") },
    })).onConflictDoNothing();
    return toLeadItem(updated);
  });
}

export async function deleteCrmLead(accountId: string, leadId: string): Promise<boolean> {
  const deleted = await db
    .delete(leads)
    .where(and(eq(leads.id, leadId), eq(leads.accountId, accountId)))
    .returning({ id: leads.id });

  return deleted.length > 0;
}

export async function confirmCrmProfileMatch(accountId: string, leadId: string, profile: CrmCapturedProfile, actorUserId: string, idempotencyKey?: string | null): Promise<CrmLeadListItem | null> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    if (!existing) return null;
    const eventKey = idempotencyKey ? `match:${idempotencyKey}` : null;
    if (eventKey) {
      const [existingEvent] = await tx.select({ id: crmLeadEvents.id }).from(crmLeadEvents).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, leadId), eq(crmLeadEvents.type, "match_confirmed"), eq(crmLeadEvents.sourceEventKey, eventKey))).limit(1);
      if (existingEvent) return toLeadItem(existing);
    }
    const [conflict] = await tx.select({ id: leads.id }).from(leads).where(and(eq(leads.accountId, accountId), eq(leads.platform, profile.platform), eq(leads.canonicalProfileUrl, profile.canonicalProfileUrl))).limit(1);
    if (conflict && conflict.id !== leadId) throw new Error("Ce profil est déjà relié à un autre lead.");
    const [updated] = await tx.update(leads).set({ platform: profile.platform, canonicalProfileUrl: profile.canonicalProfileUrl, normalizedHandle: profile.normalizedHandle, displayName: profile.displayName, socialFirstName: profile.firstName, socialLastName: profile.lastName || null, messageOccurredAt: profile.messageOccurredAt ? new Date(profile.messageOccurredAt) : existing.messageOccurredAt, capturedAt: new Date(profile.capturedAt), updatedAt: new Date() }).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).returning();
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "match_confirmed", source: "extension", sourceEventKey: eventKey, occurredAt: profile.messageOccurredAt ? new Date(profile.messageOccurredAt) : null, capturedAt: new Date(profile.capturedAt), metadata: { platform: profile.platform, handle: profile.normalizedHandle } })).onConflictDoNothing();
    return updated ? toLeadItem(updated) : null;
  });
}

export async function changeCrmStage(accountId: string, leadId: string, stage: CrmLeadStage, actorUserId: string, source: CrmEventSource = "app", idempotencyKey?: string | null): Promise<CrmLeadListItem | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    if (!current) return null;
    const eventKey = idempotencyKey ? `stage:${idempotencyKey}` : null;
    if (eventKey) {
      const [existingEvent] = await tx.select({ id: crmLeadEvents.id }).from(crmLeadEvents).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, leadId), eq(crmLeadEvents.type, "stage_changed"), eq(crmLeadEvents.sourceEventKey, eventKey))).limit(1);
      if (existingEvent) return toLeadItem(current);
    }
    if (current.crmStage === stage) return toLeadItem(current);
    const changedAt = new Date();
    const [updated] = await tx.update(leads).set({ crmStage: stage, stage: legacyStageForCrmStage(stage), updatedAt: new Date() }).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).returning();
    await tx.insert(crmLeadStageHistory).values({ accountId, leadId, fromStage: current.crmStage, toStage: stage, actorUserId, responsibleSetterId: current.setterId, source, changedAt });
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "stage_changed", source, sourceEventKey: eventKey, occurredAt: changedAt, capturedAt: changedAt, metadata: { fromStage: current.crmStage, toStage: stage, responsibleSetterId: current.setterId } })).onConflictDoNothing();
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: eventForStage(stage), source, sourceEventKey: eventKey ? `${eventKey}:milestone` : null, occurredAt: changedAt, capturedAt: changedAt, metadata: { source: "manual_stage_change", responsibleSetterId: current.setterId } })).onConflictDoNothing();
    if (current.crmStage === "first_message_sent" && stage === "conversation_in_progress") {
      await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "response_received", source, sourceEventKey: eventKey ? `${eventKey}:response` : null, occurredAt: changedAt, capturedAt: changedAt, metadata: { responsibleSetterId: current.setterId, confirmedFrom: "stage_change" } })).onConflictDoNothing();
    }
    return updated ? toLeadItem(updated) : null;
  });
}

export async function markCrmContacted(accountId: string, leadId: string, actorUserId: string, source: CrmEventSource = "app", idempotencyKey?: string | null, occurredAt = new Date()): Promise<CrmLeadListItem | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    if (!current) return null;
    const eventKey = idempotencyKey ? `contacted:${idempotencyKey}` : null;
    if (eventKey) {
      const [existingEvent] = await tx.select({ id: crmLeadEvents.id }).from(crmLeadEvents).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, leadId), eq(crmLeadEvents.type, "first_message_sent"), eq(crmLeadEvents.sourceEventKey, eventKey))).limit(1);
      if (existingEvent) return toLeadItem(current);
    }
    if (current.contactState === "contacted") return toLeadItem(current);
    const [updated] = await tx.update(leads).set({ contactState: "contacted", messageOccurredAt: current.messageOccurredAt ?? occurredAt, updatedAt: occurredAt }).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).returning();
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "first_message_sent", source, sourceEventKey: eventKey, occurredAt, capturedAt: new Date(), metadata: { responsibleSetterId: current.setterId, confirmedFrom: "crm" } })).onConflictDoNothing();
    return updated ? toLeadItem(updated) : null;
  });
}

export async function markCrmResponse(accountId: string, leadId: string, actorUserId: string, source: CrmEventSource = "app", idempotencyKey: string, occurredAt = new Date()): Promise<CrmLeadListItem | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    if (!current) return null;
    const eventKey = `response:${idempotencyKey}`;
    const [existingEvent] = await tx.select({ id: crmLeadEvents.id }).from(crmLeadEvents).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, leadId), eq(crmLeadEvents.type, "response_received"), eq(crmLeadEvents.sourceEventKey, eventKey))).limit(1);
    if (existingEvent || current.respondedAt) return toLeadItem(current);
    const [updated] = await tx.update(leads).set({ respondedAt: occurredAt, updatedAt: new Date() }).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).returning();
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "response_received", source, sourceEventKey: eventKey, occurredAt, capturedAt: new Date(), metadata: { responsibleSetterId: current.setterId } })).onConflictDoNothing();
    return updated ? toLeadItem(updated) : null;
  });
}

export async function saveCrmQualification(accountId: string, leadId: string, actorUserId: string, body: string, idempotencyKey: string, source: CrmEventSource = "app"): Promise<CrmLeadListItem | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    if (!current) return null;
    const eventKey = `qualification:${idempotencyKey}`;
    const [existingEvent] = await tx.select({ id: crmLeadEvents.id }).from(crmLeadEvents).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, leadId), eq(crmLeadEvents.type, "qualification_updated"), eq(crmLeadEvents.sourceEventKey, eventKey))).limit(1);
    if (existingEvent || current.qualificationNote === (body.trim() || null)) return toLeadItem(current);
    const changedAt = new Date();
    const [updated] = await tx.update(leads).set({ qualificationNote: body.trim() || null, updatedAt: changedAt }).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).returning();
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "qualification_updated", source, sourceEventKey: eventKey, occurredAt: changedAt, capturedAt: changedAt, metadata: { hasContent: Boolean(body.trim()), responsibleSetterId: current.setterId } })).onConflictDoNothing();
    return updated ? toLeadItem(updated) : null;
  });
}

export async function recordCrmBookingLinkSent(accountId: string, leadId: string, actorUserId: string, idempotencyKey: string): Promise<boolean> {
  const eventKey = `booking-link:${idempotencyKey}`;
  const [lead] = await db.select({ id: leads.id, setterId: leads.setterId }).from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
  if (!lead) return false;
  await db.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "booking_link_sent", source: "app", sourceEventKey: eventKey, occurredAt: new Date(), capturedAt: new Date(), metadata: { responsibleSetterId: lead.setterId } })).onConflictDoNothing();
  return true;
}

export async function getCrmBookingLink(accountId: string): Promise<string | null> {
  const [row] = await db.select({ slug: nativeBookingEvents.slug, handle: users.bookingHandle }).from(nativeBookingEvents).innerJoin(users, eq(users.id, nativeBookingEvents.userId)).where(and(eq(nativeBookingEvents.userId, accountId), eq(nativeBookingEvents.status, "active"))).orderBy(desc(nativeBookingEvents.createdAt)).limit(1);
  return row?.handle ? `/book/${row.handle}/${row.slug}` : null;
}

type BookingBlock = { startAt: Date; endAt: Date; status: string; holdExpiresAt: Date | null; closerUserId: string | null };
type ExternalBusyPeriod = { startAt: Date; endAt: Date };

function bookingBlockOverlaps(startAt: Date, endAt: Date, block: BookingBlock, beforeMinutes: number, afterMinutes: number, now: Date): boolean {
  const blocking = block.status === "confirmed" || block.status === "sync_failed" || (block.status === "pending" && Boolean(block.holdExpiresAt && block.holdExpiresAt > now));
  if (!blocking) return false;
  const bufferedStart = new Date(block.startAt.getTime() - beforeMinutes * 60_000);
  const bufferedEnd = new Date(block.endAt.getTime() + afterMinutes * 60_000);
  return startAt < bufferedEnd && endAt > bufferedStart;
}

async function getCrmExternalBusyByCloser(
  accountId: string,
  closerUserIds: string[],
  from: Date,
  to: Date,
): Promise<{
  busyByCloser: Map<string, ExternalBusyPeriod[]>;
  unavailableClosers: Set<string>;
  calendarStates: Awaited<ReturnType<typeof getCalendarStatesForClosers>>;
}> {
  const busyByCloser = new Map<string, ExternalBusyPeriod[]>();
  const unavailableClosers = new Set<string>();
  const states = await getCalendarStatesForClosers(accountId, closerUserIds);

  await Promise.all(
    closerUserIds.map(async (closerUserId) => {
      const state = states.get(closerUserId);
      if (!state) return;
      if (isCalendarTemporarilyUnavailable(state.reason)) {
        unavailableClosers.add(closerUserId);
        return;
      }
      if (state.conflictCalendars.length === 0) return;
      try {
        const periods = await Promise.all(
          state.conflictCalendars.map(({ connection, calendarId }) => listBusyForConnection(connection, from, to, [calendarId])),
        );
        busyByCloser.set(closerUserId, periods.flat());
      } catch (error) {
        console.error("[crm-booking] calendar availability failed", { closerUserId, message: error instanceof Error ? error.message : "unknown" });
        unavailableClosers.add(closerUserId);
      }
    }),
  );

  return { busyByCloser, unavailableClosers, calendarStates: states };
}

async function getCrmBookingContext(accountId: string, leadId: string) {
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
  if (!lead) return null;
  const [event] = await db.select().from(nativeBookingEvents).where(and(eq(nativeBookingEvents.userId, accountId), eq(nativeBookingEvents.status, "active"))).orderBy(desc(nativeBookingEvents.createdAt)).limit(1);
  if (!event) return { lead, event: null };
  const closerConditions = [eq(nativeBookingEventClosers.eventId, event.id), eq(nativeBookingEventClosers.isActive, true), eq(nativeBookingEventClosers.isOff, false)];
  if (lead.closerUserId) closerConditions.push(eq(nativeBookingEventClosers.closerUserId, lead.closerUserId));
  const [availability, exceptions, questions, closerRows] = await Promise.all([
    db.select().from(nativeBookingAvailability).where(eq(nativeBookingAvailability.eventId, event.id)),
    db.select().from(nativeBookingExceptions).where(eq(nativeBookingExceptions.eventId, event.id)),
    db.select().from(nativeBookingQuestions).where(eq(nativeBookingQuestions.eventId, event.id)).orderBy(asc(nativeBookingQuestions.position)),
    db.select({ assignment: nativeBookingEventClosers, user: users }).from(nativeBookingEventClosers).innerJoin(users, eq(nativeBookingEventClosers.closerUserId, users.id)).where(and(...closerConditions)).orderBy(asc(nativeBookingEventClosers.position), asc(users.email)),
  ]);
  return { lead, event, availability, exceptions, questions, closerRows };
}

export async function getCrmInternalBookingSlots(accountId: string, leadId: string): Promise<CrmBookingAvailabilityView | null> {
  const context = await getCrmBookingContext(accountId, leadId);
  if (!context || !context.event) return null;
  const { event, availability, exceptions, questions, closerRows } = context;
  if (closerRows.length === 0) return { eventName: event.name, timeZone: event.timeZone, durationMinutes: event.durationMinutes, questions, calendarNeedsAttention: false, slots: [] };
  const now = new Date();
  const baseSlots = generateBookingSlots({ event, availability, exceptions, bookings: [], now, days: event.bookingHorizonDays });
  const horizonEnd = new Date(now.getTime() + event.bookingHorizonDays * 86_400_000);
  const [nativeRows, callRows] = await Promise.all([
    db.select({ startAt: nativeBookings.startAt, endAt: nativeBookings.endAt, status: nativeBookings.status, holdExpiresAt: nativeBookings.holdExpiresAt, closerUserId: nativeBookings.closerUserId }).from(nativeBookings).where(and(eq(nativeBookings.userId, accountId), gte(nativeBookings.endAt, now), lte(nativeBookings.startAt, horizonEnd))),
    db.select({ scheduledAt: salesCalls.scheduledAt, durationMinutes: salesCalls.durationMinutes, closerUserId: salesCalls.closerUserId, attendance: salesCalls.attendance }).from(salesCalls).where(and(eq(salesCalls.userId, accountId), gte(salesCalls.scheduledAt, now), lte(salesCalls.scheduledAt, horizonEnd), ne(salesCalls.attendance, "cancelled"))),
  ]);
  const { busyByCloser, unavailableClosers, calendarStates } = await getCrmExternalBusyByCloser(
    accountId,
    closerRows.map(({ assignment }) => assignment.closerUserId),
    baseSlots[0]?.startAt ?? now,
    baseSlots.at(-1)?.endAt ?? horizonEnd,
  );
  const calendarNeedsAttention = closerRows.some(({ assignment }) => calendarStates.get(assignment.closerUserId)?.reason === "calendar_unavailable");
  const blocks: BookingBlock[] = [
    ...nativeRows,
    ...callRows.map((row) => ({ startAt: row.scheduledAt, endAt: new Date(row.scheduledAt.getTime() + (row.durationMinutes ?? event.durationMinutes) * 60_000), status: "confirmed", holdExpiresAt: null, closerUserId: row.closerUserId })),
  ];
  const slots: CrmBookingSlotView[] = [];
  for (const slot of baseSlots) {
    for (const row of closerRows) {
      const closerUserId = row.assignment.closerUserId;
      const isBusy = unavailableClosers.has(closerUserId)
        || blocks.some((block) => (block.closerUserId === closerUserId || block.closerUserId === null) && bookingBlockOverlaps(slot.startAt, slot.endAt, block, event.bufferBeforeMinutes, event.bufferAfterMinutes, now))
        || (busyByCloser.get(closerUserId) ?? []).some((period) => bookingBlockOverlaps(slot.startAt, slot.endAt, { ...period, status: "confirmed", holdExpiresAt: null, closerUserId }, event.bufferBeforeMinutes, event.bufferAfterMinutes, now));
      if (!isBusy) {
        const calendarState = calendarStates.get(closerUserId);
        slots.push({
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString(),
          timeZone: event.timeZone,
          closerUserId: row.assignment.closerUserId,
          closerName: row.user.displayName || row.user.email,
          calendarReady: Boolean(calendarState?.invitationConnection && calendarState.invitationCalendarId),
        });
      }
    }
  }
  return { eventName: event.name, timeZone: event.timeZone, durationMinutes: event.durationMinutes, questions, calendarNeedsAttention, slots: slots.slice(0, 120) };
}

type CrmInternalBookingContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  guestTimeZone: string;
  answers: Record<string, NativeBookingAnswerValue>;
};

type CrmInternalBookingResult = {
  bookingId: string;
  callId: string;
  scheduledAt: string;
  timeZone: string;
  closerName: string;
};

type CrmInternalBookingError = { error: "not_found" | "slot_unavailable" | "conflict" | "invalid" };

export async function createCrmInternalBooking(
  accountId: string,
  leadId: string,
  closerUserId: string,
  startAt: Date,
  actorUserId: string,
  idempotencyKey: string,
  contact: CrmInternalBookingContact,
): Promise<CrmInternalBookingResult | CrmInternalBookingError> {
  const eventKey = `internal-booking:${idempotencyKey}`;
  const [existingEvent] = await db
    .select({ metadata: crmLeadEvents.metadata })
    .from(crmLeadEvents)
    .where(
      and(
        eq(crmLeadEvents.accountId, accountId),
        eq(crmLeadEvents.leadId, leadId),
        eq(crmLeadEvents.type, "call_booked"),
        eq(crmLeadEvents.sourceEventKey, eventKey),
      ),
    )
    .limit(1);
  if (
    existingEvent &&
    typeof existingEvent.metadata.bookingId === "string" &&
    typeof existingEvent.metadata.salesCallId === "string" &&
    typeof existingEvent.metadata.timeZone === "string" &&
    typeof existingEvent.metadata.closerName === "string"
  ) {
    return {
      bookingId: existingEvent.metadata.bookingId,
      callId: existingEvent.metadata.salesCallId,
      scheduledAt: String(existingEvent.metadata.scheduledAt),
      timeZone: existingEvent.metadata.timeZone,
      closerName: existingEvent.metadata.closerName,
    };
  }

  const context = await getCrmBookingContext(accountId, leadId);
  if (!context || !context.event) return { error: "not_found" };
  if (!context.closerRows.some(({ assignment }) => assignment.closerUserId === closerUserId)) return { error: "invalid" };

  const nativeRequest: PublicBookingRequest = {
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    guestTimeZone: contact.guestTimeZone,
    answers: contact.answers,
    startAt: startAt.toISOString(),
    idempotencyKey,
    leadId: null,
    leadSessionKey: null,
    landingPage: null,
    referrer: null,
    linkId: null,
    metaTouchpointToken: null,
    metaCampaignExternalId: null,
    metaAdSetExternalId: null,
    metaAdExternalId: null,
    utm: {},
  };
  const nativeResult = await createNativeBookingForCrm(accountId, context.event.id, closerUserId, nativeRequest);
  if ("error" in nativeResult) {
    const error = nativeResult.error as NativeBookingError["error"];
    return { error: error === "not_found" ? "not_found" : error === "slot_unavailable" || error === "existing_booking" ? "slot_unavailable" : "invalid" };
  }

  return db.transaction(async (tx) => {
    const [lead] = await tx
      .select()
      .from(leads)
      .where(and(eq(leads.id, leadId), eq(leads.accountId, accountId)))
      .for("update")
      .limit(1);
    if (!lead) return { error: "not_found" };

    const [linkedCall] = await tx
      .select({ call: salesCalls })
      .from(salesCalls)
      .where(and(eq(salesCalls.id, nativeResult.callId), eq(salesCalls.userId, accountId), eq(salesCalls.nativeBookingId, nativeResult.bookingId)))
      .limit(1);
    if (!linkedCall) return { error: "invalid" };

    const now = new Date();
    const nextDisplayName = lead.displayName?.trim() ? undefined : `${contact.firstName.trim()} ${contact.lastName.trim()}`.trim();
    await tx
      .update(leads)
      .set({
        ...(nextDisplayName ? { displayName: nextDisplayName } : {}),
        firstName: contact.firstName.trim(),
        lastName: contact.lastName.trim(),
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        crmStage: "call_booked",
        stage: legacyStageForCrmStage("call_booked"),
        contactState: "contacted",
        updatedAt: now,
      })
      .where(and(eq(leads.id, leadId), eq(leads.accountId, accountId)));
    await tx
      .insert(crmCallLinks)
      .values({ accountId, leadId, salesCallId: nativeResult.callId, source: "app", confidence: "exact_internal_booking", linkedByUserId: actorUserId, linkedAt: now })
      .onConflictDoNothing();
    await tx.insert(crmLeadStageHistory).values({ accountId, leadId, fromStage: lead.crmStage, toStage: "call_booked", actorUserId, responsibleSetterId: lead.setterId, source: "app", changedAt: now });
    await tx
      .insert(crmLeadEvents)
      .values(
        eventValues({
          accountId,
          leadId,
          actorUserId,
          type: "call_booked",
          source: "app",
          sourceEventKey: eventKey,
          occurredAt: nativeResult.startAt,
          capturedAt: now,
          metadata: {
            bookingId: nativeResult.bookingId,
            salesCallId: nativeResult.callId,
            scheduledAt: nativeResult.startAt.toISOString(),
            timeZone: nativeResult.eventTimeZone,
            closerName: nativeResult.closerName,
            closerUserId,
            responsibleSetterId: lead.setterId,
            bookingMode: "native_crm",
          },
        }),
      )
      .onConflictDoNothing();

    return {
      bookingId: nativeResult.bookingId,
      callId: nativeResult.callId,
      scheduledAt: nativeResult.startAt.toISOString(),
      timeZone: nativeResult.eventTimeZone,
      closerName: nativeResult.closerName,
    };
  });
}

export async function setCrmOutcome(accountId: string, leadId: string, outcome: CrmLeadOutcome, actorUserId: string, source: CrmEventSource = "app", idempotencyKey?: string | null, lostReason?: CrmLostReason | null, note?: string): Promise<CrmLeadListItem | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    if (!current) return null;
    const eventKey = idempotencyKey ? `outcome:${idempotencyKey}` : null;
    if (eventKey) {
      const [existingEvent] = await tx.select({ id: crmLeadEvents.id }).from(crmLeadEvents).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, leadId), eq(crmLeadEvents.type, eventForOutcome(outcome)), eq(crmLeadEvents.sourceEventKey, eventKey))).limit(1);
      if (existingEvent) return toLeadItem(current);
    }
    if (current.crmOutcome === outcome && outcome !== "no_show") return toLeadItem(current);
    const changedAt = new Date();
    let noShowCallScheduledAt: Date | null = null;
    if (outcome === "no_show") {
      const [noShowCall] = await tx
        .select({ scheduledAt: salesCalls.scheduledAt })
        .from(crmCallLinks)
        .innerJoin(salesCalls, eq(crmCallLinks.salesCallId, salesCalls.id))
        .where(and(eq(crmCallLinks.accountId, accountId), eq(crmCallLinks.leadId, leadId), eq(salesCalls.userId, accountId), ne(salesCalls.attendance, "cancelled")))
        .orderBy(desc(salesCalls.scheduledAt), desc(salesCalls.id))
        .limit(1);
      noShowCallScheduledAt = noShowCall?.scheduledAt ?? null;
    }
    const [updated] = await tx.update(leads).set({ crmOutcome: outcome, isNoShow: outcome === "no_show", ...(outcome === "lost" ? { lostReason: lostReason ?? null } : { lostReason: null }), updatedAt: changedAt }).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).returning();
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: eventForOutcome(outcome), source, sourceEventKey: eventKey, occurredAt: changedAt, capturedAt: changedAt, metadata: { fromOutcome: current.crmOutcome, toOutcome: outcome, responsibleSetterId: current.setterId, lostReason: lostReason ?? null } })).onConflictDoNothing();
    if (outcome === "lost" && note?.trim()) {
      const noteEventKey = eventKey ? `${eventKey}:note` : null;
      const [comment] = await tx.insert(leadComments).values({ leadId, userId: actorUserId, body: note.trim() }).returning();
      await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "note_added", source, sourceEventKey: noteEventKey, occurredAt: changedAt, capturedAt: changedAt, metadata: { commentId: comment.id, context: "lost" } })).onConflictDoNothing();
    }
    if (outcome === "no_show") {
      const responsibleUserId = current.setterId ? (await tx.select({ userId: setters.userId }).from(setters).where(eq(setters.id, current.setterId)).limit(1))[0]?.userId ?? actorUserId : actorUserId;
      const dueAt = getNoShowFollowUpDueAt(noShowCallScheduledAt, changedAt);
      const [createdAction] = await tx.insert(crmActions).values({ accountId, leadId, category: "appointment", type: "no_show_follow_up", title: "Recontacter le lead après son no-show", dueAt, status: "open", responsibleUserId, createdByUserId: actorUserId, source, idempotencyKey: `no-show:${leadId}` }).onConflictDoNothing().returning({ id: crmActions.id });
      if (createdAction) {
        await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "action_created", source, sourceEventKey: `action:${createdAction.id}`, occurredAt: dueAt, capturedAt: changedAt, metadata: { actionId: createdAction.id, category: "appointment", type: "no_show_follow_up" } })).onConflictDoNothing();
      }
    }
    return updated ? toLeadItem(updated) : null;
  });
}

export type CrmCallResult = "showed" | "no_show" | "awaiting_decision" | "not_closed";

export async function setCrmCallResult(accountId: string, salesCallId: string, result: CrmCallResult, actorUserId: string): Promise<CrmCallView | null> {
  const linked = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ call: salesCalls, link: crmCallLinks, lead: leads })
      .from(salesCalls)
      .leftJoin(crmCallLinks, and(eq(crmCallLinks.salesCallId, salesCalls.id), eq(crmCallLinks.accountId, accountId)))
      .leftJoin(leads, and(eq(crmCallLinks.leadId, leads.id), eq(leads.accountId, accountId)))
      .where(and(eq(salesCalls.id, salesCallId), eq(salesCalls.userId, accountId)))
      .for("update")
      .limit(1);
    if (!row) return false;

    const now = new Date();
    const attendance = result === "no_show" ? "no_show" : "showed";
    const outcome = result === "awaiting_decision" ? "awaiting_decision" : result === "not_closed" ? "not_closed" : "pending";
    const decisionDueAt = result === "awaiting_decision" ? row.call.decisionDueAt ?? new Date(now.getTime() + 2 * 86_400_000) : null;
    await tx
      .update(salesCalls)
      .set({ attendance, outcome, decisionDueAt, outcomeSetAt: now, updatedAt: now })
      .where(and(eq(salesCalls.id, salesCallId), eq(salesCalls.userId, accountId)));

    if (row.link?.leadId && row.lead) {
      const eventType = result === "no_show" ? "no_show_marked" : "outcome_changed";
      await tx.insert(crmLeadEvents).values(eventValues({
        accountId,
        leadId: row.link.leadId,
        actorUserId,
        type: eventType,
        source: "app",
        sourceEventKey: `call-result:${salesCallId}:${result}`,
        occurredAt: now,
        capturedAt: now,
        metadata: { salesCallId, result, attendance, outcome, responsibleSetterId: row.lead.setterId },
      })).onConflictDoNothing();

      if (result === "no_show" && row.lead.crmOutcome !== "sold") {
        await tx.update(leads).set({ crmOutcome: "no_show", isNoShow: true, updatedAt: now }).where(and(eq(leads.id, row.link.leadId), eq(leads.accountId, accountId)));
        const responsibleUserId = row.lead.setterId
          ? (await tx.select({ userId: setters.userId }).from(setters).where(eq(setters.id, row.lead.setterId)).limit(1))[0]?.userId ?? actorUserId
          : actorUserId;
        const [createdAction] = await tx.insert(crmActions).values({
          accountId,
          leadId: row.link.leadId,
          category: "appointment",
          type: "no_show_follow_up",
          title: "Recontacter le lead après son no-show",
          dueAt: getNoShowFollowUpDueAt(row.call.scheduledAt, now),
          status: "open",
          responsibleUserId,
          createdByUserId: actorUserId,
          source: "app",
          idempotencyKey: `no-show:${row.link.leadId}`,
        }).onConflictDoNothing().returning({ id: crmActions.id });
        if (createdAction) {
          await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId: row.link.leadId, actorUserId, type: "action_created", source: "app", sourceEventKey: `action:${createdAction.id}`, occurredAt: now, capturedAt: now, metadata: { actionId: createdAction.id, category: "appointment", type: "no_show_follow_up", salesCallId } })).onConflictDoNothing();
        }
      }

      if (result !== "awaiting_decision") {
        await tx.update(crmActions).set({ status: "cancelled", completedAt: now, completedByUserId: actorUserId, updatedAt: now }).where(and(eq(crmActions.accountId, accountId), eq(crmActions.leadId, row.link.leadId), eq(crmActions.type, "call_decision"), eq(crmActions.status, "open")));
      } else {
        const [createdAction] = await tx.insert(crmActions).values({
          accountId,
          leadId: row.link.leadId,
          category: "sales",
          type: "call_decision",
          title: "Relancer pour obtenir la décision après l'appel",
          dueAt: row.call.decisionDueAt ?? new Date(now.getTime() + 2 * 86_400_000),
          status: "open",
          responsibleUserId: row.lead.setterId ? (await tx.select({ userId: setters.userId }).from(setters).where(eq(setters.id, row.lead!.setterId!)).limit(1))[0]?.userId ?? actorUserId : actorUserId,
          createdByUserId: actorUserId,
          source: "app",
          sourceId: salesCallId,
          idempotencyKey: `call-decision:${salesCallId}`,
        }).onConflictDoNothing().returning({ id: crmActions.id });
        if (createdAction) {
          await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId: row.link.leadId, actorUserId, type: "action_created", source: "app", sourceEventKey: `action:${createdAction.id}`, occurredAt: row.call.decisionDueAt ?? now, capturedAt: now, metadata: { actionId: createdAction.id, category: "sales", type: "call_decision", salesCallId } })).onConflictDoNothing();
        }
      }
    }
    return true;
  });
  if (!linked) return null;
  return (await getCrmCalls(accountId)).find((call) => call.id === salesCallId) ?? null;
}

export async function reopenCrmLead(accountId: string, leadId: string, actorUserId: string, requestedStage?: CrmLeadStage, idempotencyKey?: string | null): Promise<CrmLeadListItem | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    if (!current) return null;
    const eventKey = idempotencyKey ? `reopen:${idempotencyKey}` : null;
    if (eventKey) {
      const [existingEvent] = await tx.select({ id: crmLeadEvents.id }).from(crmLeadEvents).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, leadId), eq(crmLeadEvents.type, "lead_reopened"), eq(crmLeadEvents.sourceEventKey, eventKey))).limit(1);
      if (existingEvent) return toLeadItem(current);
    }
    const nextStage = requestedStage ?? defaultStageAfterReopen(current.crmStage);
    const changedAt = new Date();
    const stageChanged = current.crmStage !== nextStage;
    const [updated] = await tx.update(leads).set({ crmOutcome: "none", isNoShow: false, crmStage: nextStage, stage: legacyStageForCrmStage(nextStage), updatedAt: changedAt }).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).returning();
    if (!updated) return null;
    const stageEventKey = eventKey ? `${eventKey}:stage` : null;
    if (stageChanged) {
      await tx.insert(crmLeadStageHistory).values({ accountId, leadId, fromStage: current.crmStage, toStage: nextStage, actorUserId, responsibleSetterId: current.setterId, source: "app", changedAt });
      await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "stage_changed", source: "app", sourceEventKey: stageEventKey, occurredAt: changedAt, capturedAt: changedAt, metadata: { fromStage: current.crmStage, toStage: nextStage, responsibleSetterId: current.setterId, source: "reopen" } })).onConflictDoNothing();
      await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: eventForStage(nextStage), source: "app", sourceEventKey: stageEventKey ? `${stageEventKey}:milestone` : null, occurredAt: changedAt, capturedAt: changedAt, metadata: { source: "reopen", responsibleSetterId: current.setterId } })).onConflictDoNothing();
      if (current.crmStage === "first_message_sent" && nextStage === "conversation_in_progress") {
        await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "response_received", source: "app", sourceEventKey: stageEventKey ? `${stageEventKey}:response` : null, occurredAt: changedAt, capturedAt: changedAt, metadata: { responsibleSetterId: current.setterId, confirmedFrom: "stage_change" } })).onConflictDoNothing();
      }
    }
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "lead_reopened", source: "app", sourceEventKey: eventKey, occurredAt: changedAt, capturedAt: changedAt, metadata: { previousOutcome: current.crmOutcome, previousStage: current.crmStage, stage: nextStage } })).onConflictDoNothing();
    return updated ? toLeadItem(updated) : null;
  });
}

export async function reassignCrmLead(accountId: string, leadId: string, nextSetterId: string | null, actorUserId: string, idempotencyKey: string): Promise<CrmLeadListItem | null> {
  const nextSetter = await getSetterForAccount(accountId, nextSetterId);
  if (nextSetterId && !nextSetter) throw new Error("Le responsable n'appartient pas à ce compte.");
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    if (!current) return null;
    const eventKey = `responsibility:${idempotencyKey}`;
    const [existingEvent] = await tx.select({ id: crmLeadEvents.id }).from(crmLeadEvents).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, leadId), eq(crmLeadEvents.type, "responsibility_changed"), eq(crmLeadEvents.sourceEventKey, eventKey))).limit(1);
    if (existingEvent) return toLeadItem(current);
    if (current.setterId === nextSetterId) return toLeadItem(current, nextSetter?.name ?? null);
    const changedAt = new Date();
    const [updated] = await tx.update(leads).set({ setterId: nextSetterId, updatedAt: changedAt }).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).returning();
    await tx.insert(crmResponsibilityHistory).values({ accountId, leadId, previousSetterId: current.setterId, nextSetterId, actorUserId });
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "responsibility_changed", source: "app", sourceEventKey: eventKey, occurredAt: changedAt, capturedAt: changedAt, metadata: { previousSetterId: current.setterId, nextSetterId } })).onConflictDoNothing();
    const nextResponsibleUserId = nextSetter?.userId ?? null;
    await tx.update(crmActions).set({ responsibleUserId: nextResponsibleUserId, updatedAt: new Date() }).where(and(eq(crmActions.accountId, accountId), eq(crmActions.leadId, leadId), eq(crmActions.category, "prospecting"), eq(crmActions.status, "open")));
    return updated ? toLeadItem(updated, nextSetter?.name ?? null) : null;
  });
}

export async function addCrmNote(accountId: string, leadId: string, actorUserId: string, body: string, source: CrmEventSource = "app", idempotencyKey?: string | null): Promise<{ id: string; userId: string; body: string; createdAt: string } | null> {
  return db.transaction(async (tx) => {
    const [lead] = await tx.select({ id: leads.id }).from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    if (!lead) return null;
    const eventKey = idempotencyKey ? `note:${idempotencyKey}` : null;
    if (eventKey) {
      const [existingEvent] = await tx.select({ commentId: crmLeadEvents.metadata }).from(crmLeadEvents).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, leadId), eq(crmLeadEvents.type, "note_added"), eq(crmLeadEvents.sourceEventKey, eventKey))).limit(1);
      const commentId = existingEvent?.commentId.commentId;
      if (typeof commentId === "string") {
        const [existingComment] = await tx.select().from(leadComments).where(and(eq(leadComments.id, commentId), eq(leadComments.leadId, leadId))).limit(1);
        if (existingComment) return { id: existingComment.id, userId: existingComment.userId, body: existingComment.body, createdAt: existingComment.createdAt.toISOString() };
      }
    }
    const [comment] = await tx.insert(leadComments).values({ leadId, userId: actorUserId, body }).returning();
    const createdAt = comment.createdAt;
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "note_added", source, sourceEventKey: eventKey, occurredAt: createdAt, capturedAt: new Date(), metadata: { commentId: comment.id } })).onConflictDoNothing();
    return { id: comment.id, userId: comment.userId, body: comment.body, createdAt: createdAt.toISOString() };
  });
}

async function accountUserExists(accountId: string, userId: string): Promise<boolean> {
  if (accountId === userId) return true;
  const [member] = await db.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.accountId, accountId), eq(teamMembers.memberUserId, userId), eq(teamMembers.status, "active"))).limit(1);
  return Boolean(member);
}

export async function getCrmActions(accountId: string, filters: CrmActionFilters & { leadId?: string } = {}, pagination: CrmActionPagination = {}): Promise<CrmActionView[]> {
  const conditions = [eq(crmActions.accountId, accountId)];
  if (filters.leadId) conditions.push(eq(crmActions.leadId, filters.leadId));
  if (filters.category) conditions.push(eq(crmActions.category, filters.category));
  if (filters.relanceOnly) conditions.push(or(eq(crmActions.type, "follow_up"), eq(crmActions.type, "no_show_follow_up")) ?? eq(crmActions.id, "00000000-0000-0000-0000-000000000000"));
  if (filters.status) conditions.push(eq(crmActions.status, filters.status));
  if (filters.responsibleUserId) conditions.push(eq(crmActions.responsibleUserId, filters.responsibleUserId));
  if (filters.overdueOnly) conditions.push(lt(crmActions.dueAt, new Date()), eq(crmActions.status, "open"));
  if (filters.dueTodayOnly) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    conditions.push(gte(crmActions.dueAt, start), lt(crmActions.dueAt, end), eq(crmActions.status, "open"));
  }
  conditions.push(eq(leads.accountId, accountId));
  const limit = Math.min(Math.max(pagination.limit ?? 500, 1), 500);
  const offset = Math.max(pagination.offset ?? 0, 0);
  const rows = await db.select({ action: crmActions, lead: { displayName: leads.displayName, firstName: leads.firstName, lastName: leads.lastName, normalizedHandle: leads.normalizedHandle }, responsible: { id: users.id, displayName: users.displayName, email: users.email } }).from(crmActions).innerJoin(leads, and(eq(crmActions.leadId, leads.id), eq(leads.accountId, accountId))).leftJoin(users, eq(crmActions.responsibleUserId, users.id)).where(and(...conditions)).orderBy(asc(crmActions.status), asc(crmActions.dueAt), desc(crmActions.priority), asc(crmActions.id)).limit(limit).offset(offset);
  const nextCalls = await getNextCalls(accountId, Array.from(new Set(rows.map(({ action }) => action.leadId))));
  return rows.map(({ action, lead, responsible }) => {
    const nextCall = nextCalls.get(action.leadId);
    return toActionView({ action, lead, responsible, nextCall: nextCall ? { scheduledAt: nextCall.scheduledAt, timeZone: nextCall.timeZone, closer: nextCall.closer, attendance: nextCall.attendance, outcome: nextCall.outcome } : null });
  });
}

export async function createCrmAction(accountId: string, actorUserId: string, input: CrmActionInput): Promise<CrmActionView | null> {
  if (input.responsibleUserId && !(await accountUserExists(accountId, input.responsibleUserId))) throw new Error("Le responsable n'appartient pas à ce compte.");
  return db.transaction(async (tx) => {
    const [lead] = await tx.select({ id: leads.id }).from(leads).where(and(eq(leads.id, input.leadId), eq(leads.accountId, accountId))).limit(1);
    if (!lead) return null;
    const responsibleUserId = input.responsibleUserId ?? actorUserId;
    const actionSource = input.source ?? "app";
    const findExisting = async () => {
      const [existing] = await tx.select({ action: crmActions, lead: { displayName: leads.displayName, firstName: leads.firstName, lastName: leads.lastName, normalizedHandle: leads.normalizedHandle }, responsible: { id: users.id, displayName: users.displayName, email: users.email } }).from(crmActions).innerJoin(leads, and(eq(crmActions.leadId, leads.id), eq(leads.accountId, accountId))).leftJoin(users, eq(crmActions.responsibleUserId, users.id)).where(and(eq(crmActions.accountId, accountId), eq(crmActions.idempotencyKey, input.idempotencyKey ?? ""))).limit(1);
      return existing;
    };
    if (input.idempotencyKey) {
      const existing = await findExisting();
      if (existing) {
        if (existing.action.leadId !== input.leadId || existing.action.category !== input.category || existing.action.type !== input.type || existing.action.title !== input.title || existing.action.dueAt.getTime() !== input.dueAt.getTime() || existing.action.responsibleUserId !== responsibleUserId) throw new Error("CRM_IDEMPOTENCY_CONFLICT");
        return toActionView(existing);
      }
    }
    const [created] = await tx.insert(crmActions).values({ accountId, leadId: input.leadId, category: input.category, type: input.type, title: input.title, dueAt: input.dueAt, priority: input.priority ?? 0, responsibleUserId, createdByUserId: actorUserId, source: actionSource, sourceId: input.sourceId ?? null, idempotencyKey: input.idempotencyKey ?? null, updatedAt: new Date() }).onConflictDoNothing({ target: [crmActions.accountId, crmActions.idempotencyKey] }).returning();
    if (!created) {
      const existing = await findExisting();
      if (!existing) throw new Error("CRM_ACTION_CREATE_FAILED");
      if (existing.action.leadId !== input.leadId || existing.action.category !== input.category || existing.action.type !== input.type || existing.action.title !== input.title || existing.action.dueAt.getTime() !== input.dueAt.getTime() || existing.action.responsibleUserId !== responsibleUserId) throw new Error("CRM_IDEMPOTENCY_CONFLICT");
      return toActionView(existing);
    }
    const now = new Date();
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId: input.leadId, actorUserId, type: "action_created", source: actionSource, sourceEventKey: `action:${created.id}`, occurredAt: now, capturedAt: now, metadata: { actionId: created.id, category: input.category, type: input.type } })).onConflictDoNothing();
    const [joined] = await tx.select({ action: crmActions, lead: { displayName: leads.displayName, firstName: leads.firstName, lastName: leads.lastName, normalizedHandle: leads.normalizedHandle }, responsible: { id: users.id, displayName: users.displayName, email: users.email } }).from(crmActions).innerJoin(leads, and(eq(crmActions.leadId, leads.id), eq(leads.accountId, accountId))).leftJoin(users, eq(crmActions.responsibleUserId, users.id)).where(and(eq(crmActions.accountId, accountId), eq(crmActions.id, created.id))).limit(1);
    return joined ? toActionView(joined) : null;
  });
}

export async function completeCrmAction(accountId: string, actionId: string, actorUserId: string, status: "completed" | "cancelled", canManage = false, idempotencyKey?: string | null): Promise<CrmActionView | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(crmActions).where(and(eq(crmActions.id, actionId), eq(crmActions.accountId, accountId))).limit(1);
    if (!current) return null;
    const [currentView] = await tx.select({ action: crmActions, lead: { displayName: leads.displayName, firstName: leads.firstName, lastName: leads.lastName, normalizedHandle: leads.normalizedHandle }, responsible: { id: users.id, displayName: users.displayName, email: users.email } }).from(crmActions).innerJoin(leads, and(eq(crmActions.leadId, leads.id), eq(leads.accountId, accountId))).leftJoin(users, eq(crmActions.responsibleUserId, users.id)).where(and(eq(crmActions.id, actionId), eq(crmActions.accountId, accountId))).limit(1);
    if (current.status !== "open") return current.status === status && currentView ? toActionView(currentView) : null;
    if (!canManage && current.responsibleUserId !== actorUserId) return null;
    const now = new Date();
    const [updated] = await tx.update(crmActions).set({ status, completedAt: status === "completed" ? now : null, completedByUserId: status === "completed" ? actorUserId : null, updatedAt: now }).where(and(eq(crmActions.id, actionId), eq(crmActions.accountId, accountId), eq(crmActions.status, "open"))).returning();
    if (!updated) return currentView ? toActionView(currentView) : null;
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId: current.leadId, actorUserId, type: status === "completed" ? "action_completed" : "action_cancelled", source: "app", sourceEventKey: idempotencyKey ? `action:${actionId}:${status}:${idempotencyKey}` : `action:${actionId}:${status}`, occurredAt: now, capturedAt: now, metadata: { actionId } })).onConflictDoNothing();
    const [joined] = await tx.select({ action: crmActions, lead: { displayName: leads.displayName, firstName: leads.firstName, lastName: leads.lastName, normalizedHandle: leads.normalizedHandle }, responsible: { id: users.id, displayName: users.displayName, email: users.email } }).from(crmActions).innerJoin(leads, and(eq(crmActions.leadId, leads.id), eq(leads.accountId, accountId))).leftJoin(users, eq(crmActions.responsibleUserId, users.id)).where(and(eq(crmActions.id, updated.id), eq(crmActions.accountId, accountId))).limit(1);
    return joined ? toActionView(joined) : null;
  });
}

export async function rescheduleCrmAction(accountId: string, actionId: string, actorUserId: string, dueAt: Date, canManage = false, idempotencyKey: string): Promise<CrmActionView | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(crmActions).where(and(eq(crmActions.id, actionId), eq(crmActions.accountId, accountId))).for("update").limit(1);
    if (!current) return null;
    if (!canManage && current.responsibleUserId !== actorUserId) return null;
    const eventKey = `action-rescheduled:${actionId}:${idempotencyKey}`;
    const [existingEvent] = await tx.select({ id: crmLeadEvents.id }).from(crmLeadEvents).where(and(eq(crmLeadEvents.accountId, accountId), eq(crmLeadEvents.leadId, current.leadId), eq(crmLeadEvents.type, "action_rescheduled"), eq(crmLeadEvents.sourceEventKey, eventKey))).limit(1);
    if (existingEvent) {
      const [existingView] = await tx.select({ action: crmActions, lead: { displayName: leads.displayName, firstName: leads.firstName, lastName: leads.lastName, normalizedHandle: leads.normalizedHandle }, responsible: { id: users.id, displayName: users.displayName, email: users.email } }).from(crmActions).innerJoin(leads, and(eq(crmActions.leadId, leads.id), eq(leads.accountId, accountId))).leftJoin(users, eq(crmActions.responsibleUserId, users.id)).where(and(eq(crmActions.id, actionId), eq(crmActions.accountId, accountId))).limit(1);
      return existingView ? toActionView(existingView) : null;
    }
    if (current.status !== "open") return null;
    const changedAt = new Date();
    const [updated] = await tx.update(crmActions).set({ dueAt, updatedAt: changedAt }).where(and(eq(crmActions.id, actionId), eq(crmActions.accountId, accountId), eq(crmActions.status, "open"))).returning();
    if (!updated) return null;
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId: current.leadId, actorUserId, type: "action_rescheduled", source: "app", sourceEventKey: eventKey, occurredAt: changedAt, capturedAt: changedAt, metadata: { actionId, previousDueAt: current.dueAt.toISOString(), nextDueAt: dueAt.toISOString() } })).onConflictDoNothing();
    const [joined] = await tx.select({ action: crmActions, lead: { displayName: leads.displayName, firstName: leads.firstName, lastName: leads.lastName, normalizedHandle: leads.normalizedHandle }, responsible: { id: users.id, displayName: users.displayName, email: users.email } }).from(crmActions).innerJoin(leads, and(eq(crmActions.leadId, leads.id), eq(leads.accountId, accountId))).leftJoin(users, eq(crmActions.responsibleUserId, users.id)).where(and(eq(crmActions.id, updated.id), eq(crmActions.accountId, accountId))).limit(1);
    return joined ? toActionView(joined) : null;
  });
}

export async function getNextCrmAction(accountId: string, responsibleUserId: string | null, excludedActionId: string, filters: Pick<CrmActionFilters, "category" | "relanceOnly" | "overdueOnly" | "dueTodayOnly"> = {}): Promise<CrmActionView | null> {
  const actions = await getCrmActions(accountId, { status: "open", responsibleUserId: responsibleUserId ?? undefined, ...filters }, { limit: 100 });
  return actions.find((action) => action.id !== excludedActionId) ?? null;
}

export type CrmCallPagination = { limit: number; offset: number };

export async function getCrmCalls(accountId: string, leadId?: string, filters: CrmCallFilters = {}, pagination?: CrmCallPagination): Promise<CrmCallView[]> {
  const conditions = [eq(salesCalls.userId, accountId)];
  if (leadId) conditions.push(eq(crmCallLinks.leadId, leadId));
  if (filters.unlinkedOnly) conditions.push(isNull(crmCallLinks.leadId));
  if (filters.source) conditions.push(eq(salesCalls.source, filters.source));
  if (filters.attendance) conditions.push(eq(salesCalls.attendance, filters.attendance));
  if (filters.outcome) conditions.push(eq(salesCalls.outcome, filters.outcome));
  if (filters.from && !Number.isNaN(Date.parse(filters.from))) conditions.push(gte(salesCalls.scheduledAt, new Date(`${filters.from}T00:00:00.000Z`)));
  if (filters.to && !Number.isNaN(Date.parse(filters.to))) conditions.push(lte(salesCalls.scheduledAt, new Date(`${filters.to}T23:59:59.999Z`)));
  if (filters.search?.trim()) {
    const pattern = `%${filters.search.trim()}%`;
    conditions.push(or(
      ilike(salesCalls.inviteeName, pattern),
      ilike(salesCalls.inviteeEmail, pattern),
      ilike(salesCalls.inviteePhone, pattern),
      ilike(salesCalls.iclosedCallId, pattern),
      ilike(salesCalls.eventType, pattern),
      ilike(leads.displayName, pattern),
      ilike(leads.firstName, pattern),
      ilike(leads.lastName, pattern),
      ilike(leads.normalizedHandle, pattern),
    ) ?? eq(salesCalls.id, "00000000-0000-0000-0000-000000000000"));
  }
  const query = db
    .select({ call: salesCalls, link: crmCallLinks, lead: leads, callSetterName: callSetters.name, leadSetterName: leadSetters.name })
    .from(salesCalls)
    .leftJoin(crmCallLinks, and(eq(crmCallLinks.salesCallId, salesCalls.id), eq(crmCallLinks.accountId, accountId)))
    .leftJoin(leads, and(eq(crmCallLinks.leadId, leads.id), eq(leads.accountId, accountId)))
    .leftJoin(callSetters, eq(salesCalls.setterId, callSetters.id))
    .leftJoin(leadSetters, eq(leads.setterId, leadSetters.id))
    .where(and(...conditions))
    .orderBy(desc(salesCalls.scheduledAt), asc(salesCalls.id));
  const rows = pagination ? await query.limit(pagination.limit).offset(pagination.offset) : await query;
  const suggestions = await getCrmCallSuggestions(accountId, rows.filter(({ link }) => !link?.leadId).map(({ call }) => call.id));
  const views = rows.map((row) => toCallView({ ...row, setterName: row.callSetterName ?? row.leadSetterName, suggestion: row.link?.leadId ? null : suggestions.get(row.call.id) ?? null }));
  return filters.suggestionStatus ? views.filter((call) => call.suggestion?.status === filters.suggestionStatus) : views;
}

export async function linkCrmCall(accountId: string, actorUserId: string, leadId: string, salesCallId: string, confidence: string): Promise<CrmCallView | null> {
  const linked = await db.transaction(async (tx) => {
    const [lead] = await tx.select({ id: leads.id }).from(leads).where(and(eq(leads.id, leadId), eq(leads.accountId, accountId))).limit(1);
    const [call] = await tx.select().from(salesCalls).where(and(eq(salesCalls.id, salesCallId), eq(salesCalls.userId, accountId))).limit(1);
    if (!lead || !call) return false;

    const [existing] = await tx
      .select({ leadId: crmCallLinks.leadId })
      .from(crmCallLinks)
      .where(and(eq(crmCallLinks.accountId, accountId), eq(crmCallLinks.salesCallId, salesCallId)))
      .limit(1);
    if (existing) return existing.leadId === leadId;

    const now = new Date();
    const [inserted] = await tx
      .insert(crmCallLinks)
      .values({ accountId, leadId, salesCallId, source: "app", confidence, linkedByUserId: actorUserId, linkedAt: now })
      .onConflictDoNothing({ target: [crmCallLinks.accountId, crmCallLinks.salesCallId] })
      .returning({ id: crmCallLinks.id });
    if (!inserted) return false;
    await tx.insert(crmLeadEvents).values(eventValues({ accountId, leadId, actorUserId, type: "match_confirmed", source: "app", sourceEventKey: `call-link:${salesCallId}`, occurredAt: call.scheduledAt, capturedAt: now, metadata: { salesCallId, confidence } })).onConflictDoNothing();
    return true;
  });
  if (!linked) return null;
  return (await getCrmCalls(accountId, leadId)).find((item) => item.id === salesCallId) ?? null;
}

export type CrmKpiFilters = {
  setterId?: string;
  platform?: "instagram" | "linkedin";
  offerId?: string;
  source?: string;
};

export async function getCrmKpiSources(accountId: string, from: Date, to: Date, filters: CrmKpiFilters = {}) {
  const fromDate = from.toISOString().slice(0, 10);
  const toDate = to.toISOString().slice(0, 10);
  const [setter, eventRows, stageRows, leadRows, callRows, saleRows] = await Promise.all([
    filters.setterId ? db.select({ id: setters.id, userId: setters.userId }).from(setters).where(and(eq(setters.id, filters.setterId), eq(setters.userId, accountId))).limit(1) : Promise.resolve([] as Array<{ id: string; userId: string }>),
    db.select({ event: crmLeadEvents, lead: { platform: leads.platform, offerId: leads.offerId, source: leads.source, setterId: leads.setterId } }).from(crmLeadEvents).innerJoin(leads, and(eq(crmLeadEvents.leadId, leads.id), eq(leads.accountId, accountId))).where(and(eq(crmLeadEvents.accountId, accountId), gte(sql`coalesce(${crmLeadEvents.occurredAt}, ${crmLeadEvents.createdAt})`, from.toISOString()), lte(sql`coalesce(${crmLeadEvents.occurredAt}, ${crmLeadEvents.createdAt})`, to.toISOString()))),
    db.select({ history: crmLeadStageHistory, lead: { id: leads.id, platform: leads.platform, offerId: leads.offerId, source: leads.source, setterId: leads.setterId, crmStage: leads.crmStage, createdAt: leads.createdAt } }).from(crmLeadStageHistory).innerJoin(leads, and(eq(crmLeadStageHistory.leadId, leads.id), eq(leads.accountId, accountId))).where(eq(crmLeadStageHistory.accountId, accountId)),
    db.select({ lead: { id: leads.id, platform: leads.platform, offerId: leads.offerId, source: leads.source, setterId: leads.setterId, crmStage: leads.crmStage, createdAt: leads.createdAt } }).from(leads).where(eq(leads.accountId, accountId)),
    db.select({ call: salesCalls, link: crmCallLinks, lead: { platform: leads.platform, offerId: leads.offerId, source: leads.source, setterId: leads.setterId } }).from(salesCalls).leftJoin(crmCallLinks, and(eq(crmCallLinks.salesCallId, salesCalls.id), eq(crmCallLinks.accountId, accountId))).leftJoin(leads, and(eq(crmCallLinks.leadId, leads.id), eq(leads.accountId, accountId))).where(and(eq(salesCalls.userId, accountId), gte(salesCalls.scheduledAt, from), lte(salesCalls.scheduledAt, to))),
    db.select({ sale: sales, lead: { platform: leads.platform, offerId: leads.offerId, source: leads.source, setterId: leads.setterId } }).from(sales).leftJoin(leads, and(eq(sales.leadId, leads.id), eq(leads.accountId, accountId))).where(and(eq(sales.userId, accountId), gte(sales.saleDate, fromDate), lte(sales.saleDate, toDate))),
  ]);
  if (filters.setterId && !setter[0]) return { events: [], stageChanges: [], calls: [], sales: [] };
  const setterUserId = setter[0]?.userId;
  const matchesLead = (lead: { platform: "instagram" | "linkedin" | null; offerId: string | null; source: string; setterId: string | null } | null, includeCurrentSetter = true) => {
    if (!lead) return false;
    if (filters.platform && lead.platform !== filters.platform) return false;
    if (filters.offerId && lead.offerId !== filters.offerId) return false;
    if (filters.source && lead.source !== filters.source) return false;
    if (includeCurrentSetter && filters.setterId && lead.setterId !== filters.setterId) return false;
    return true;
  };
  const events = eventRows.filter(({ event, lead }) => {
    if (!matchesLead(lead, !filters.setterId)) return false;
    if (!filters.setterId) return true;
    const responsibleSetterId = event.metadata.responsibleSetterId;
    return event.actorUserId === setterUserId || responsibleSetterId === filters.setterId;
  }).map(({ event }) => ({ leadId: event.leadId, type: event.type, actorUserId: event.actorUserId, source: event.source, occurredAt: event.occurredAt, capturedAt: event.capturedAt, createdAt: event.createdAt, metadata: event.metadata }));
  const stageRowsAtEnd = stageRows.filter(({ history }) => history.changedAt <= to);
  const allHistoryLeadIds = new Set(stageRows.map(({ history }) => history.leadId));
  const candidateStageLeadIds = new Set(
    stageRowsAtEnd
      .filter(({ history, lead }) => {
        if (!matchesLead(lead, false)) return false;
        if (!filters.setterId) return true;
        return lead.setterId === filters.setterId || history.actorUserId === setterUserId || history.responsibleSetterId === filters.setterId;
      })
      .map(({ history }) => history.leadId),
  );
  const stageChanges: CrmKpiStageChange[] = stageRowsAtEnd
    .filter(({ history, lead }) => matchesLead(lead, false) && (!filters.setterId || candidateStageLeadIds.has(history.leadId)))
    .map(({ history }) => ({ leadId: history.leadId, fromStage: history.fromStage, toStage: history.toStage, actorUserId: history.actorUserId, responsibleSetterId: history.responsibleSetterId, occurredAt: history.changedAt }));
  for (const { lead } of leadRows) {
    if (lead.createdAt > to || allHistoryLeadIds.has(lead.id) || !matchesLead(lead, false)) continue;
    if (filters.setterId && lead.setterId !== filters.setterId) continue;
    stageChanges.push({ leadId: lead.id, fromStage: null, toStage: lead.crmStage, actorUserId: null, responsibleSetterId: lead.setterId, occurredAt: lead.createdAt });
  }
  const calls = callRows.filter(({ link, lead }) => Boolean(link?.leadId) && matchesLead(lead)).map(({ link, call }) => ({ leadId: link?.leadId ?? null, scheduledAt: call.scheduledAt, attendance: call.attendance }));
  const linkedSales = saleRows.filter(({ sale, lead }) => Boolean(sale.leadId) && matchesLead(lead)).map(({ sale }) => ({ leadId: sale.leadId, saleDate: sale.saleDate, totalPrice: sale.totalPrice }));
  return { events, stageChanges, calls, sales: linkedSales };
}
