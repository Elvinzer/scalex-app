import { describe, expect, it } from "vitest";

import { computeCrmKpis, currentCrmPeriod, getCrmPrimaryKpiPresentation, isCrmKpiEventAttributedToSetter, isLegacyCaptureFirstMessageEvent, isReliableFirstMessageEvent, matchesCrmKpiAttribution, resolveCrmKpiSetterId, type CrmKpiEvent } from "./kpis";
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

function snapshot(leadId: string, stage: CrmLeadStage, outcome: "none" | "no_show" | "lost" | "sold" = "none", contactState?: "new" | "contacted", leadCreatedAt = new Date("2026-09-10T12:00:00Z")) {
  return {
    leadId,
    fromStage: null,
    toStage: stage,
    occurredAt: asOf,
    currentSnapshot: true,
    currentOutcome: outcome,
    currentContactState: contactState,
    leadCreatedAt,
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
  });

  it("counts unique first messages, including messages recorded at profile capture", () => {
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

    expect(counts.messages).toBe(2);
    expect(counts.conversations).toBe(1);
    expect(counts.cohortFirstMessages).toBe(2);
    expect(isReliableFirstMessageEvent(repeated)).toBe(true);
  });

  it("uses the lead creation date for an advanced legacy lead without a first-message date", () => {
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
      events: [
        migrated,
        unverifiedMigration,
        event({ leadId: "legacy-stage-without-date", type: "first_message_sent", occurredAt: "2026-09-06T09:00:00Z" }),
        event({ leadId: "legacy-stage-without-date", type: "response_received", occurredAt: "2026-09-08T09:00:00Z" }),
      ],
      stageChanges: [
        snapshot("migrated-contact", "conversation_in_progress", "none", "contacted"),
        { leadId: "legacy-stage-without-date", fromStage: "first_message_sent", toStage: "conversation_in_progress", occurredAt: new Date("2026-09-11T09:00:00Z") },
        { leadId: "legacy-stage-without-date", fromStage: "conversation_in_progress", toStage: "value_content_sent", occurredAt: new Date("2026-09-12T09:00:00Z") },
        snapshot("legacy-stage-without-date", "value_content_sent"),
      ],
      calls: [],
      sales: [],
    });

    expect(isReliableFirstMessageEvent(migrated)).toBe(true);
    expect(isReliableFirstMessageEvent(unverifiedMigration)).toBe(false);
    expect(counts.messages).toBe(2);
    expect(counts.conversations).toBe(1);
    expect(counts.valueContent).toBe(1);
    expect(counts.cohortConversations).toBe(1);
  });

  it("counts legacy profile-capture messages on their capture timestamp", () => {
    const capturedFirstMessage = event({
      leadId: "captured-lead",
      type: "first_message_sent",
      occurredAt: "2026-09-05T09:00:00Z",
      metadata: { selectedAtCapture: true, responsibleSetterId: "setter-1" },
    });
    capturedFirstMessage.source = "app";
    capturedFirstMessage.sourceEventKey = "capture:profile:stage";

    const counts = computeCrmKpis({
      events: [capturedFirstMessage],
      stageChanges: [snapshot("captured-lead", "first_message_sent", "none", "contacted")],
      calls: [],
      sales: [],
      period,
      asOf,
    });

    expect(isLegacyCaptureFirstMessageEvent(capturedFirstMessage)).toBe(true);
    expect(isReliableFirstMessageEvent(capturedFirstMessage)).toBe(true);
    expect(counts.messages).toBe(1);
  });

  it("uses the initial first-message stage date when the event row is missing", () => {
    const sentAtCreation = new Date("2026-09-08T12:15:00Z");
    const counts = computeCrmKpis({
      events: [],
      stageChanges: [
        { leadId: "sent-at-creation", fromStage: null, toStage: "first_message_sent", occurredAt: sentAtCreation },
        snapshot("sent-at-creation", "first_message_sent", "none", "contacted", sentAtCreation),
      ],
      calls: [],
      sales: [],
      period,
      asOf,
    });

    expect(counts.messages).toBe(1);
  });

  it("uses the lead creation date for a current advanced-stage lead without a first-message date", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [],
      stageChanges: [snapshot("legacy-stage-without-date", "conversation_in_progress")],
      calls: [],
      sales: [],
    });

    expect(counts.messages).toBe(1);
    expect(counts.conversations).toBe(1);
  });

  it("does not include a contacted lead in a period before its creation date", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [],
      stageChanges: [snapshot("old-legacy-lead", "conversation_in_progress", "none", "contacted", new Date("2026-08-31T23:59:59Z"))],
      calls: [],
      sales: [],
    });

    expect(counts.conversations).toBe(0);
  });

  it("does not use a contacted lead's creation date when it falls outside the selected period", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [event({ leadId: "active-legacy-lead", type: "response_received", occurredAt: "2026-09-12T09:00:00Z" })],
      stageChanges: [snapshot("active-legacy-lead", "conversation_in_progress", "none", "contacted", new Date("2026-08-01T12:00:00Z"))],
      calls: [],
      sales: [],
    });

    expect(counts.messages).toBe(0);
  });

  it("counts capture-time messages with their current stages", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [
        firstMessage("measured", "2026-09-05T09:00:00Z"),
        event({ leadId: "unverified", type: "first_message_sent", occurredAt: "2026-09-06T09:00:00Z", metadata: { selectedAtCapture: true } }),
      ],
      stageChanges: [snapshot("measured", "conversation_in_progress"), snapshot("unverified", "value_content_sent")],
      calls: [],
      sales: [],
    });

    expect(counts.messages).toBe(2);
    expect(counts.conversations).toBe(1);
    expect(counts.valueContent).toBe(1);
  });

  it("renders measurable capture-time counts and rates", () => {
    const counts = computeCrmKpis({
      period,
      asOf,
      events: [event({ leadId: "unverified", type: "first_message_sent", occurredAt: "2026-09-06T09:00:00Z", metadata: { selectedAtCapture: true } })],
      stageChanges: [snapshot("unverified", "first_message_sent")],
      calls: [],
      sales: [],
    });

    for (const key of ["messages", "conversations", "valueContent"] as const) {
      expect(getCrmPrimaryKpiPresentation(counts, key, false, "Non mesuré")).toMatchObject({ displayValue: key === "messages" ? "1" : "0", isMeasured: true });
    }
    for (const key of ["responses", "callsProposed", "callsBooked"] as const) {
      expect(getCrmPrimaryKpiPresentation(counts, key, false, "Non mesuré")).toMatchObject({ displayValue: "0%", isMeasured: true });
    }
    expect(getCrmPrimaryKpiPresentation(counts, "messages", true, "Non mesuré")).toMatchObject({ displayValue: "Non mesuré", isMeasured: false });
  });

  it("does not include a reliably dated message outside the selected cohort", () => {
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
        snapshot("outside-cohort", "conversation_in_progress", "none", undefined, new Date("2026-08-31T23:59:59Z")),
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

  it("counts a November reply in the October first-message cohort rate", () => {
    const october = {
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-10-31T23:59:59.999Z"),
    };
    const novemberAsOf = new Date("2026-11-02T23:59:59.999Z");
    const sentAt = new Date("2026-10-31T09:00:00.000Z");
    const counts = computeCrmKpis({
      period: october,
      asOf: novemberAsOf,
      events: [firstMessage("month-boundary-lead", sentAt.toISOString())],
      stageChanges: [
        { leadId: "month-boundary-lead", fromStage: null, toStage: "first_message_sent", occurredAt: sentAt },
        {
          leadId: "month-boundary-lead",
          fromStage: "first_message_sent",
          toStage: "conversation_in_progress",
          occurredAt: new Date("2026-11-01T09:00:00.000Z"),
        },
      ],
      calls: [],
      sales: [],
    });

    expect(counts.messages).toBe(1);
    expect(counts.cohortConversations).toBe(1);
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
