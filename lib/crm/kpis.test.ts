import { describe, expect, it } from "vitest";

import { computeCrmKpis, currentCrmPeriod, isCrmKpiEventAttributedToSetter, isReliableFirstMessageEvent, matchesCrmKpiAttribution, resolveCrmKpiSetterId, type CrmKpiEvent } from "./kpis";
import type { CrmEventMetadata, CrmEventType, CrmLeadStage } from "./types";

const period = { from: new Date("2026-09-01T00:00:00.000Z"), to: new Date("2026-09-30T23:59:59.999Z") };
const asOf = new Date("2026-10-10T23:59:59.999Z");

function event(input: {
  leadId: string;
  type: CrmEventType;
  occurredAt: string | null;
  capturedAt?: string | null;
  createdAt?: string;
  metadata?: CrmEventMetadata;
}): CrmKpiEvent {
  return {
    leadId: input.leadId,
    type: input.type,
    occurredAt: input.occurredAt ? new Date(input.occurredAt) : null,
    capturedAt: input.capturedAt ? new Date(input.capturedAt) : null,
    createdAt: new Date(input.createdAt ?? input.occurredAt ?? input.capturedAt ?? "2026-09-01T00:00:00Z"),
    metadata: input.metadata ?? {},
  };
}

function firstMessage(leadId: string, occurredAt: string): CrmKpiEvent {
  return event({ leadId, type: "first_message_sent", occurredAt, metadata: { confirmedFrom: "crm" } });
}

function snapshot(leadId: string, stage: CrmLeadStage, outcome: "none" | "no_show" | "lost" | "sold" = "none", contactState?: "new" | "contacted") {
  return {
    leadId,
    fromStage: null,
    toStage: stage,
    occurredAt: asOf,
    currentSnapshot: true,
    currentOutcome: outcome,
    currentContactState: contactState,
  } as const;
}

describe("CRM KPI projection", () => {
  it("keeps personal KPIs scoped to the current setter and team KPIs scoped to the selection", () => {
    expect(resolveCrmKpiSetterId({ teamView: false, personalSetterId: "current-setter" })).toBe("current-setter");
    expect(resolveCrmKpiSetterId({ teamView: false })).toBeNull();
    expect(resolveCrmKpiSetterId({ teamView: true })).toBeUndefined();
    expect(resolveCrmKpiSetterId({ teamView: true, selectedSetterId: "selected-setter" })).toBe("selected-setter");
  });

  it("attributes a KPI cohort at the first message and counts later conversions after reassignment", () => {
    const firstMessageBySetter = { ...firstMessage("lead-1", "2026-09-10T09:00:00Z"), metadata: { responsibleSetterId: "setter-a", confirmedFrom: "crm" } };
    const responseByOtherSetter = {
      ...event({ leadId: "lead-1", type: "response_received", occurredAt: "2026-09-11T09:00:00Z" }),
      actorUserId: "setter-b-user",
      metadata: { responsibleSetterId: "setter-b" },
    };
    const proposalByOtherSetter = {
      ...event({ leadId: "lead-1", type: "call_proposed", occurredAt: "2026-09-12T09:00:00Z" }),
      actorUserId: "setter-b-user",
      metadata: { responsibleSetterId: "setter-b" },
    };
    const bookingByOtherSetter = {
      ...event({ leadId: "lead-1", type: "call_booked", occurredAt: "2026-09-13T09:00:00Z" }),
      actorUserId: "setter-b-user",
      metadata: { responsibleSetterId: "setter-b" },
    };
    const anotherSetterMessage = {
      ...firstMessage("lead-2", "2026-09-14T09:00:00Z"),
      metadata: { responsibleSetterId: "setter-b", confirmedFrom: "crm" },
      includeInCohort: false,
    };
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [firstMessageBySetter, responseByOtherSetter, proposalByOtherSetter, bookingByOtherSetter, anotherSetterMessage],
      stageChanges: [
        snapshot("lead-1", "conversation_in_progress"),
        { ...snapshot("lead-2", "conversation_in_progress"), includeInCurrentCounts: false },
      ],
      calls: [],
      sales: [],
    });

    expect(isCrmKpiEventAttributedToSetter(firstMessageBySetter, "setter-a")).toBe(true);
    expect(isCrmKpiEventAttributedToSetter({ actorUserId: "setter-a-user" }, "setter-a", "setter-a-user")).toBe(true);
    expect(isCrmKpiEventAttributedToSetter({ actorUserId: "setter-b-user" }, "setter-a", "setter-a-user")).toBe(false);
    expect(counts.messages).toBe(1);
    expect(counts.conversations).toBe(1);
    expect(counts.rates.response).toBe(1);
    expect(counts.rates.callProposed).toBe(1);
    expect(counts.rates.callBooked).toBe(1);
    expect(counts.incomplete).toBe(false);
  });

  it("counts unique confirmed first messages and flags legacy unverified records", () => {
    const repeated = firstMessage("lead-1", "2026-09-01T09:00:00Z");
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [
        repeated,
        { ...repeated, createdAt: new Date("2026-09-02T10:00:00Z") },
        event({ leadId: "lead-1", type: "conversation_started", occurredAt: "2026-09-03T10:00:00Z" }),
        event({ leadId: "lead-2", type: "first_message_sent", occurredAt: "2026-09-04T10:00:00Z", metadata: { selectedAtCapture: true } }),
        event({ leadId: "lead-3", type: "profile_captured", occurredAt: null, capturedAt: "2026-09-04T10:00:00Z" }),
      ],
      calls: [],
      sales: [],
    });

    expect(counts.messages).toBe(1);
    expect(counts.conversations).toBe(1);
    expect(counts.cohortFirstMessages).toBe(1);
    expect(counts.incomplete).toBe(true);
    expect(isReliableFirstMessageEvent(repeated)).toBe(true);
  });

  it("counts only timestamped first-message events created by the legacy migration and flags legacy stages without dates", () => {
    const migrated = event({
      leadId: "migrated-contact",
      type: "first_message_sent",
      occurredAt: "2026-09-05T09:00:00Z",
    });
    migrated.source = "migration";
    migrated.sourceEventKey = "migration:first-message:migrated-contact";
    const unverifiedMigration = event({
      leadId: "unverified-contact",
      type: "first_message_sent",
      occurredAt: "2026-09-06T09:00:00Z",
    });
    unverifiedMigration.source = "migration";
    unverifiedMigration.sourceEventKey = "migration:other:unverified-contact";

    const counts = computeCrmKpis({
      period,
      asOf,
      events: [migrated, unverifiedMigration],
      stageChanges: [
        snapshot("migrated-contact", "conversation_in_progress", "none", "contacted"),
        snapshot("legacy-stage-without-date", "value_content_sent"),
      ],
      calls: [],
      sales: [],
    });

    expect(isReliableFirstMessageEvent(migrated)).toBe(true);
    expect(isReliableFirstMessageEvent(unverifiedMigration)).toBe(false);
    expect(counts.messages).toBe(1);
    expect(counts.conversations).toBe(1);
    expect(counts.valueContent).toBe(0);
    expect(counts.incomplete).toBe(true);
  });

  it("marks a current advanced-stage lead without a first-message date as incomplete", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [],
      stageChanges: [snapshot("legacy-stage-without-date", "conversation_in_progress")],
      calls: [],
      sales: [],
    });

    expect(counts.messages).toBe(0);
    expect(counts.conversations).toBe(0);
    expect(counts.incomplete).toBe(true);
  });

  it("does not mark a reliably dated message outside the selected cohort as incomplete", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [
        firstMessage("selected-cohort", "2026-09-12T09:00:00Z"),
        firstMessage("older-cohort", "2026-08-31T09:00:00Z"),
      ],
      stageChanges: [
        snapshot("selected-cohort", "first_message_sent", "none", "contacted"),
        snapshot("older-cohort", "conversation_in_progress", "none", "contacted"),
      ],
      calls: [],
      sales: [],
    });

    expect(counts.messages).toBe(1);
    expect(counts.conversations).toBe(0);
    expect(counts.incomplete).toBe(false);
  });

  it("counts current open cohort stages and excludes lost or sold leads", () => {
    const leads = ["conversation", "value-content", "proposed", "lost", "sold"];
    const counts = computeCrmKpis({
      period,
      asOf,
      events: leads.map((leadId, index) => firstMessage(leadId, `2026-09-0${index + 1}T09:00:00Z`)),
      stageChanges: [
        snapshot("conversation", "conversation_in_progress"),
        snapshot("value-content", "value_content_sent"),
        snapshot("proposed", "call_proposed"),
        snapshot("lost", "conversation_in_progress", "lost"),
        snapshot("sold", "value_content_sent", "sold"),
        snapshot("outside-cohort", "conversation_in_progress"),
      ],
      calls: [],
      sales: [],
    });

    expect(counts.messages).toBe(5);
    expect(counts.conversations).toBe(1);
    expect(counts.valueContent).toBe(1);
  });

  it("keeps reassigned cohort leads out of a former setter's current-stage count", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [firstMessage("reassigned", "2026-09-03T09:00:00Z"), firstMessage("still-owned", "2026-09-04T09:00:00Z")],
      stageChanges: [
        { ...snapshot("reassigned", "conversation_in_progress"), includeInCurrentCounts: false },
        { ...snapshot("still-owned", "conversation_in_progress"), includeInCurrentCounts: true },
      ],
      calls: [],
      sales: [],
    });

    expect(counts.messages).toBe(2);
    expect(counts.conversations).toBe(1);
  });

  it("uses the first-message cohort for all three rates and counts later conversions through today", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [
        firstMessage("lead-1", "2026-09-28T09:00:00Z"),
        firstMessage("lead-1", "2026-09-28T09:00:00Z"),
        firstMessage("lead-2", "2026-09-30T11:00:00Z"),
        firstMessage("older-lead", "2026-08-31T11:00:00Z"),
        event({ leadId: "lead-1", type: "response_received", occurredAt: "2026-10-02T09:00:00Z" }),
        event({ leadId: "lead-1", type: "call_proposed", occurredAt: "2026-10-03T09:00:00Z" }),
        event({
          leadId: "lead-1",
          type: "call_booked",
          occurredAt: "2026-10-20T09:00:00Z",
          capturedAt: "2026-10-04T09:00:00Z",
          metadata: { bookingMode: "native_crm" },
        }),
      ],
      calls: [{ leadId: "lead-2", scheduledAt: new Date("2026-10-22T09:00:00Z"), bookedAt: new Date("2026-10-05T09:00:00Z"), attendance: "booked" }],
      sales: [],
    });

    expect(counts.cohortFirstMessages).toBe(2);
    expect(counts.cohortConversations).toBe(1);
    expect(counts.cohortCallsProposed).toBe(1);
    expect(counts.cohortCallsBooked).toBe(2);
    expect(counts.rates.response).toBe(0.5);
    expect(counts.rates.callProposed).toBe(0.5);
    expect(counts.rates.callBooked).toBe(1);
  });

  it("uses stage history for replies and respects a reopened lead's current stage", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [firstMessage("lead-1", "2026-09-02T09:00:00Z")],
      stageChanges: [
        { leadId: "lead-1", fromStage: "first_message_sent", toStage: "conversation_in_progress", occurredAt: new Date("2026-09-03T09:00:00Z") },
        { leadId: "lead-1", fromStage: "conversation_in_progress", toStage: "value_content_sent", occurredAt: new Date("2026-09-04T09:00:00Z") },
        { leadId: "lead-1", fromStage: "value_content_sent", toStage: "conversation_in_progress", occurredAt: new Date("2026-10-02T09:00:00Z") },
        snapshot("lead-1", "conversation_in_progress"),
      ],
      calls: [],
      sales: [],
    });

    expect(counts.cohortConversations).toBe(1);
    expect(counts.conversations).toBe(1);
    expect(counts.valueContent).toBe(0);
    expect(counts.rates.response).toBe(1);
  });

  it("deduplicates repeated proposals, bookings, and canonical call records by lead", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [
        firstMessage("lead-1", "2026-09-01T09:00:00Z"),
        event({ leadId: "lead-1", type: "call_proposed", occurredAt: "2026-09-03T09:00:00Z" }),
        event({ leadId: "lead-1", type: "call_proposed", occurredAt: "2026-09-04T09:00:00Z" }),
        event({ leadId: "lead-1", type: "call_booked", occurredAt: "2026-09-05T09:00:00Z" }),
      ],
      calls: [
        { leadId: "lead-1", scheduledAt: new Date("2026-09-06T09:00:00Z"), bookedAt: new Date("2026-09-06T09:00:00Z"), attendance: "booked" },
        { leadId: "lead-1", scheduledAt: new Date("2026-09-07T09:00:00Z"), bookedAt: new Date("2026-09-07T09:00:00Z"), attendance: "booked" },
      ],
      sales: [],
    });

    expect(counts.cohortCallsProposed).toBe(1);
    expect(counts.cohortCallsBooked).toBe(1);
    expect(counts.callsProposed).toBe(1);
    expect(counts.callsBooked).toBe(1);
    expect(counts.rates.callProposed).toBe(1);
    expect(counts.rates.callBooked).toBe(1);
  });

  it("keeps selected-period commercial totals bounded to the selected period", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [
        event({ leadId: "old", type: "sale_validated", occurredAt: "2026-08-31T10:00:00Z" }),
        event({ leadId: "new", type: "sale_validated", occurredAt: "2026-09-04T10:00:00Z" }),
      ],
      calls: [
        { leadId: "lead-1", scheduledAt: new Date("2026-09-03T10:00:00Z"), attendance: "showed" },
        { leadId: "lead-1", scheduledAt: new Date("2026-09-03T11:00:00Z"), attendance: "no_show" },
        { leadId: "lead-2", scheduledAt: new Date("2026-10-03T11:00:00Z"), attendance: "showed" },
      ],
      sales: [
        { leadId: "new", saleDate: "2026-09-04", totalPrice: 350 },
        { leadId: "old", saleDate: "2026-08-31", totalPrice: 500 },
      ],
    });

    expect(counts.sales).toBe(1);
    expect(counts.revenue).toBe(350);
    expect(counts.callsAttended).toBe(1);
    expect(counts.noShows).toBe(1);
  });

  it("returns null for rates with no first-message denominator", () => {
    const counts = computeCrmKpis({ period, asOf, events: [], calls: [], sales: [] });

    expect(counts.cohortFirstMessages).toBe(0);
    expect(counts.rates.response).toBeNull();
    expect(counts.rates.callProposed).toBeNull();
    expect(counts.rates.callBooked).toBeNull();
  });

  it("filters acquisition source independently from contact platform", () => {
    const instagramLead = { platform: "instagram" as const, offerId: "offer-1", source: "linkedin", setterId: "setter-1" };
    const linkedinLead = { ...instagramLead, platform: "linkedin" as const, source: "instagram" };

    expect(matchesCrmKpiAttribution(instagramLead, { source: "linkedin" })).toBe(true);
    expect(matchesCrmKpiAttribution(instagramLead, { platform: "linkedin" })).toBe(false);
    expect(matchesCrmKpiAttribution(linkedinLead, { source: "linkedin" })).toBe(false);
    expect(matchesCrmKpiAttribution(linkedinLead, { source: "instagram", platform: "linkedin" })).toBe(true);
  });

  it("builds a UTC calendar-month period", () => {
    const result = currentCrmPeriod(new Date("2026-09-15T14:00:00Z"));
    expect(result.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-09-30T23:59:59.999Z");
  });
});
