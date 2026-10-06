import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import {
  crmLeadEvents,
  crmLeadStageHistory,
  crmMessageAbTestAssignments,
  crmMessageAbTests,
  leads,
} from "@/db/schema";
import {
  calculateCrmMessageAbTestResults,
  decideCrmMessageAbTestSend,
  transitionCrmMessageAbTest,
} from "./message-ab-test-rules";
import type {
  CrmMessageAbTestAction,
  CrmMessageAbTestChannel,
  CrmMessageAbTestMetricEvent,
  CrmMessageAbTestResults,
  CrmMessageAbTestStatus,
  CrmMessageAbTestVariant,
} from "./message-ab-test-rules";

export {
  CRM_MESSAGE_AB_TEST_MIN_MATURED_WINDOWS,
  CRM_MESSAGE_AB_TEST_WINDOW_MS,
  calculateCrmMessageAbTestResults,
  decideCrmMessageAbTestSend,
  isCrmMessageAbTestEligibleCapture,
  pickCrmMessageAbTestVariant,
  renderCrmMessageAbTestMessage,
  transitionCrmMessageAbTest,
} from "./message-ab-test-rules";
export type {
  CrmMessageAbTestAction,
  CrmMessageAbTestChannel,
  CrmMessageAbTestMetricAssignment,
  CrmMessageAbTestMetricEvent,
  CrmMessageAbTestMetrics,
  CrmMessageAbTestResults,
  CrmMessageAbTestStatus,
  CrmMessageAbTestVariant,
} from "./message-ab-test-rules";

export type CrmMessageAbTestAssignmentView = {
  id: string;
  testId: string;
  channel: CrmMessageAbTestChannel;
  variant: CrmMessageAbTestVariant;
  messageSnapshot: string;
  status: CrmMessageAbTestStatus;
  assignedAt: Date;
  sentAt: Date | null;
};

export type CrmMessageAbTestView = {
  id: string;
  name: string;
  channel: CrmMessageAbTestChannel;
  status: CrmMessageAbTestStatus;
  variantAMessage: string;
  variantBMessage: string;
  startedAt: Date;
  pausedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  results: CrmMessageAbTestResults;
};

type CrmMessageAbTestRow = typeof crmMessageAbTests.$inferSelect;

function toCrmMessageAbTestView(row: CrmMessageAbTestRow, results: CrmMessageAbTestResults): CrmMessageAbTestView {
  return {
    id: row.id,
    name: row.name,
    channel: row.channel,
    status: row.status,
    variantAMessage: row.variantAMessage,
    variantBMessage: row.variantBMessage,
    startedAt: row.startedAt,
    pausedAt: row.pausedAt,
    endedAt: row.endedAt,
    createdAt: row.createdAt,
    results,
  };
}

export function isCrmMessageAbTestUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

async function loadResults(accountId: string, testId: string, status: CrmMessageAbTestStatus): Promise<CrmMessageAbTestResults> {
  const assignmentRows = await db
    .select({ leadId: crmMessageAbTestAssignments.leadId, variant: crmMessageAbTestAssignments.variant, sentAt: crmMessageAbTestAssignments.sentAt })
    .from(crmMessageAbTestAssignments)
    .where(and(eq(crmMessageAbTestAssignments.accountId, accountId), eq(crmMessageAbTestAssignments.testId, testId)))
    .orderBy(asc(crmMessageAbTestAssignments.assignedAt));
  if (assignmentRows.length === 0) return calculateCrmMessageAbTestResults([], [], new Date(), status);

  const leadIds = [...new Set(assignmentRows.map((assignment) => assignment.leadId))];
  const eventRows = await db
    .select({ leadId: crmLeadEvents.leadId, type: crmLeadEvents.type, occurredAt: crmLeadEvents.occurredAt })
    .from(crmLeadEvents)
    .where(and(
      eq(crmLeadEvents.accountId, accountId),
      inArray(crmLeadEvents.leadId, leadIds),
      inArray(crmLeadEvents.type, ["response_received", "call_booked"]),
    ));
  const metricEvents: CrmMessageAbTestMetricEvent[] = [];
  for (const event of eventRows) {
    if (event.type === "response_received") metricEvents.push({ leadId: event.leadId, type: "response_received", occurredAt: event.occurredAt });
    if (event.type === "call_booked") metricEvents.push({ leadId: event.leadId, type: "call_booked", occurredAt: event.occurredAt });
  }
  return calculateCrmMessageAbTestResults(assignmentRows, metricEvents, new Date(), status);
}

export async function listCrmMessageAbTests(accountId: string): Promise<CrmMessageAbTestView[]> {
  const rows = await db
    .select()
    .from(crmMessageAbTests)
    .where(eq(crmMessageAbTests.accountId, accountId))
    .orderBy(desc(crmMessageAbTests.createdAt));
  return Promise.all(rows.map(async (row) => toCrmMessageAbTestView(row, await loadResults(accountId, row.id, row.status))));
}

export async function getCrmMessageAbTest(accountId: string, testId: string): Promise<CrmMessageAbTestView | null> {
  const [row] = await db
    .select()
    .from(crmMessageAbTests)
    .where(and(eq(crmMessageAbTests.accountId, accountId), eq(crmMessageAbTests.id, testId)))
    .limit(1);
  return row ? toCrmMessageAbTestView(row, await loadResults(accountId, row.id, row.status)) : null;
}

export async function getCrmMessageAbTestAssignmentByLead(accountId: string, leadId: string): Promise<CrmMessageAbTestAssignmentView | null> {
  const [row] = await db
    .select({
      id: crmMessageAbTestAssignments.id,
      testId: crmMessageAbTestAssignments.testId,
      channel: crmMessageAbTests.channel,
      variant: crmMessageAbTestAssignments.variant,
      messageSnapshot: crmMessageAbTestAssignments.messageSnapshot,
      status: crmMessageAbTests.status,
      assignedAt: crmMessageAbTestAssignments.assignedAt,
      sentAt: crmMessageAbTestAssignments.sentAt,
    })
    .from(crmMessageAbTestAssignments)
    .innerJoin(crmMessageAbTests, eq(crmMessageAbTests.id, crmMessageAbTestAssignments.testId))
    .innerJoin(leads, eq(leads.id, crmMessageAbTestAssignments.leadId))
    .where(and(
      eq(crmMessageAbTestAssignments.accountId, accountId),
      eq(crmMessageAbTestAssignments.leadId, leadId),
      eq(crmMessageAbTests.accountId, accountId),
      eq(leads.accountId, accountId),
    ))
    .limit(1);
  return row ?? null;
}

export async function getCrmMessageAbTestChannelStatus(accountId: string, channel: CrmMessageAbTestChannel): Promise<"active" | "paused" | null> {
  const [active] = await db.select({ id: crmMessageAbTests.id }).from(crmMessageAbTests).where(and(
    eq(crmMessageAbTests.accountId, accountId),
    eq(crmMessageAbTests.channel, channel),
    eq(crmMessageAbTests.status, "active"),
  )).limit(1);
  if (active) return "active";
  const [paused] = await db.select({ id: crmMessageAbTests.id }).from(crmMessageAbTests).where(and(
    eq(crmMessageAbTests.accountId, accountId),
    eq(crmMessageAbTests.channel, channel),
    eq(crmMessageAbTests.status, "paused"),
  )).orderBy(desc(crmMessageAbTests.startedAt)).limit(1);
  return paused ? "paused" : null;
}

export async function createCrmMessageAbTest(input: {
  accountId: string;
  actorUserId: string;
  idempotencyKey: string;
  name: string;
  channel: CrmMessageAbTestChannel;
  variantAMessage: string;
  variantBMessage: string;
}): Promise<CrmMessageAbTestView> {
  const requestMatches = (existing: typeof crmMessageAbTests.$inferSelect) => existing.name === input.name.trim()
    && existing.channel === input.channel
    && existing.variantAMessage === input.variantAMessage.trim()
    && existing.variantBMessage === input.variantBMessage.trim();

  const created = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(crmMessageAbTests).where(and(
      eq(crmMessageAbTests.accountId, input.accountId),
      eq(crmMessageAbTests.createIdempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (existing) {
      if (!requestMatches(existing)) throw new Error("CRM_MESSAGE_AB_TEST_IDEMPOTENCY_CONFLICT");
      return existing;
    }

    const [inserted] = await tx.insert(crmMessageAbTests).values({
      accountId: input.accountId,
      createdByUserId: input.actorUserId,
      createIdempotencyKey: input.idempotencyKey,
      name: input.name.trim(),
      channel: input.channel,
      variantAMessage: input.variantAMessage.trim(),
      variantBMessage: input.variantBMessage.trim(),
      status: "active",
      startedAt: new Date(),
    }).onConflictDoNothing({ target: [crmMessageAbTests.accountId, crmMessageAbTests.createIdempotencyKey] }).returning();
    if (inserted) return inserted;
    const [raced] = await tx.select().from(crmMessageAbTests).where(and(
      eq(crmMessageAbTests.accountId, input.accountId),
      eq(crmMessageAbTests.createIdempotencyKey, input.idempotencyKey),
    )).limit(1);
    if (!raced) throw new Error("CRM_MESSAGE_AB_TEST_CREATE_CONFLICT");
    if (!requestMatches(raced)) throw new Error("CRM_MESSAGE_AB_TEST_IDEMPOTENCY_CONFLICT");
    return raced;
  });
  return toCrmMessageAbTestView(created, await loadResults(input.accountId, created.id, created.status));
}

export async function updateCrmMessageAbTestStatus(
  accountId: string,
  testId: string,
  action: CrmMessageAbTestAction,
): Promise<{ state: "updated"; test: CrmMessageAbTestView } | { state: "not_found" | "invalid_transition" | "channel_occupied" }> {
  const result = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(crmMessageAbTests)
      .where(and(eq(crmMessageAbTests.accountId, accountId), eq(crmMessageAbTests.id, testId)))
      .for("update")
      .limit(1);
    if (!current) return { state: "not_found" as const };

    const activeChannelTest = action === "resume" && current.status === "paused"
      ? await tx.select({ id: crmMessageAbTests.id })
          .from(crmMessageAbTests)
          .where(and(eq(crmMessageAbTests.accountId, accountId), eq(crmMessageAbTests.channel, current.channel), eq(crmMessageAbTests.status, "active")))
          .limit(1)
      : [];
    const transition = transitionCrmMessageAbTest(current.status, action, activeChannelTest.length > 0);
    if (!transition.ok) return { state: transition.reason };

    if (transition.status === current.status) return { state: "updated" as const, test: current };
    const changedAt = new Date();
    const [updated] = await tx.update(crmMessageAbTests).set({
      status: transition.status,
      pausedAt: action === "pause" ? changedAt : action === "resume" ? null : current.pausedAt,
      endedAt: action === "end" ? changedAt : current.endedAt,
      updatedAt: changedAt,
    }).where(and(eq(crmMessageAbTests.accountId, accountId), eq(crmMessageAbTests.id, testId))).returning();
    return updated ? { state: "updated" as const, test: updated } : { state: "not_found" as const };
  });
  if (result.state !== "updated") return result;
  return { state: "updated", test: toCrmMessageAbTestView(result.test, await loadResults(accountId, testId, result.test.status)) };
}

export async function confirmCrmMessageAbTestSend(
  accountId: string,
  actorUserId: string,
  assignmentId: string,
): Promise<{ state: "confirmed" | "already_confirmed"; assignment: CrmMessageAbTestAssignmentView } | { state: "not_found" | "test_ended" | "already_contacted" }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        assignment: crmMessageAbTestAssignments,
        test: crmMessageAbTests,
        lead: leads,
      })
      .from(crmMessageAbTestAssignments)
      .innerJoin(crmMessageAbTests, eq(crmMessageAbTests.id, crmMessageAbTestAssignments.testId))
      .innerJoin(leads, eq(leads.id, crmMessageAbTestAssignments.leadId))
      .where(and(
        eq(crmMessageAbTestAssignments.accountId, accountId),
        eq(crmMessageAbTestAssignments.id, assignmentId),
        eq(crmMessageAbTestAssignments.testId, crmMessageAbTests.id),
        eq(crmMessageAbTestAssignments.leadId, leads.id),
        eq(crmMessageAbTests.accountId, accountId),
        eq(leads.accountId, accountId),
      ))
      .for("update")
      .limit(1);
    if (!row) return { state: "not_found" };
    const { assignment, test, lead } = row;
    const view: CrmMessageAbTestAssignmentView = {
      id: assignment.id,
      testId: assignment.testId,
      channel: test.channel,
      variant: assignment.variant,
      messageSnapshot: assignment.messageSnapshot,
      status: test.status,
      assignedAt: assignment.assignedAt,
      sentAt: assignment.sentAt,
    };
    const sendDecision = decideCrmMessageAbTestSend({
      sentAt: assignment.sentAt,
      testStatus: test.status,
      contactState: lead.contactState,
      messageOccurredAt: lead.messageOccurredAt,
    });
    if (sendDecision === "already_confirmed") return { state: sendDecision, assignment: view };
    if (sendDecision !== "confirm") return { state: sendDecision };

    const sentAt = new Date();
    const [updatedLead] = await tx.update(leads).set({
      contactState: "contacted",
      messageOccurredAt: sentAt,
      updatedAt: sentAt,
    }).where(and(eq(leads.id, lead.id), eq(leads.accountId, accountId), eq(leads.contactState, "new"), isNull(leads.messageOccurredAt))).returning({ id: leads.id });
    if (!updatedLead) return { state: "already_contacted" };

    await tx.update(crmMessageAbTestAssignments).set({ sentAt, sentByUserId: actorUserId })
      .where(and(eq(crmMessageAbTestAssignments.id, assignment.id), eq(crmMessageAbTestAssignments.accountId, accountId), isNull(crmMessageAbTestAssignments.sentAt)));
    const eventKey = `crm-message-ab-test:${assignment.id}:sent`;
    await tx.insert(crmLeadEvents).values({
      accountId,
      leadId: lead.id,
      actorUserId,
      type: "first_message_sent",
      source: "extension",
      sourceEventKey: eventKey,
      occurredAt: sentAt,
      capturedAt: sentAt,
      metadata: {
        confirmedFrom: "crm",
        messageAbTestId: test.id,
        messageAbTestAssignmentId: assignment.id,
        messageVariant: assignment.variant,
        responsibleSetterId: lead.setterId,
      },
    }).onConflictDoNothing();

    const [initialStageHistory] = await tx.select({ id: crmLeadStageHistory.id }).from(crmLeadStageHistory)
      .where(and(eq(crmLeadStageHistory.accountId, accountId), eq(crmLeadStageHistory.leadId, lead.id), isNull(crmLeadStageHistory.fromStage)))
      .limit(1);
    if (!initialStageHistory) {
      await tx.insert(crmLeadStageHistory).values({
        accountId,
        leadId: lead.id,
        fromStage: null,
        toStage: "first_message_sent",
        actorUserId,
        responsibleSetterId: lead.setterId,
        source: "extension",
        changedAt: sentAt,
      });
    }
    return { state: "confirmed", assignment: { ...view, sentAt, status: test.status } };
  });
}
