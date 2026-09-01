import { describe, expect, it } from "vitest";

import { computeCrmKpis, currentCrmPeriod } from "./kpis";

const period = { from: new Date("2026-09-01T00:00:00.000Z"), to: new Date("2026-09-30T23:59:59.999Z") };

describe("CRM KPI projection", () => {
  it("counts one lead once despite repeated captures and repeated stage events", () => {
    const counts = computeCrmKpis({
      period,
      events: [
        { leadId: "lead-1", type: "first_message_sent", occurredAt: new Date("2026-09-01T09:00:00Z"), capturedAt: null, createdAt: new Date("2026-09-01T10:00:00Z") },
        { leadId: "lead-1", type: "first_message_sent", occurredAt: new Date("2026-09-01T09:00:00Z"), capturedAt: null, createdAt: new Date("2026-09-02T10:00:00Z") },
        { leadId: "lead-1", type: "conversation_started", occurredAt: new Date("2026-09-02T10:00:00Z"), capturedAt: null, createdAt: new Date("2026-09-02T10:00:00Z") },
      ],
      calls: [],
      sales: [],
    });
    expect(counts.messages).toBe(1);
    expect(counts.conversations).toBe(1);
    expect(counts.cohortFirstMessages).toBe(1);
    expect(counts.cohortConverted).toBe(1);
  });

  it("uses canonical calls and sales without duplicating a lead", () => {
    const counts = computeCrmKpis({
      period,
      events: [{ leadId: "lead-1", type: "sale_validated", occurredAt: new Date("2026-09-04T10:00:00Z"), capturedAt: null, createdAt: new Date("2026-09-04T10:00:00Z") }],
      calls: [
        { leadId: "lead-1", scheduledAt: new Date("2026-09-03T10:00:00Z"), attendance: "showed" },
        { leadId: "lead-1", scheduledAt: new Date("2026-09-03T11:00:00Z"), attendance: "no_show" },
      ],
      sales: [{ leadId: "lead-1", saleDate: "2026-09-04" }],
    });
    expect(counts.callsAttended).toBe(1);
    expect(counts.noShows).toBe(1);
    expect(counts.sales).toBe(1);
  });

  it("does not carry historical sale events into the selected period", () => {
    const counts = computeCrmKpis({
      period,
      events: [
        { leadId: "old", type: "sale_validated", occurredAt: new Date("2026-08-31T10:00:00Z"), capturedAt: null, createdAt: new Date("2026-08-31T10:00:00Z") },
        { leadId: "new", type: "sale_validated", occurredAt: new Date("2026-09-04T10:00:00Z"), capturedAt: null, createdAt: new Date("2026-09-04T10:00:00Z") },
      ],
      calls: [],
      sales: [],
    });

    expect(counts.sales).toBe(1);
    expect(counts.incomplete).toBe(false);
  });

  it("does not start a first-message cohort from a profile capture alone", () => {
    const counts = computeCrmKpis({
      period,
      events: [
        { leadId: "lead-profile-only", type: "profile_captured", occurredAt: null, capturedAt: new Date("2026-09-02T10:00:00Z"), createdAt: new Date("2026-09-02T10:00:00Z") },
      ],
      calls: [],
      sales: [],
    });

    expect(counts.cohortFirstMessages).toBe(0);
    expect(counts.rates.response).toBeNull();
  });

  it("counts cohort milestones that happen later in the selected period", () => {
    const counts = computeCrmKpis({
      period,
      events: [
        { leadId: "lead-1", type: "first_message_sent", occurredAt: new Date("2026-09-01T09:00:00Z"), capturedAt: null, createdAt: new Date("2026-09-01T09:00:00Z") },
        { leadId: "lead-1", type: "conversation_started", occurredAt: new Date("2026-09-20T09:00:00Z"), capturedAt: null, createdAt: new Date("2026-09-20T09:00:00Z") },
        { leadId: "lead-1", type: "value_content_sent", occurredAt: new Date("2026-09-21T09:00:00Z"), capturedAt: null, createdAt: new Date("2026-09-21T09:00:00Z") },
      ],
      calls: [],
      sales: [],
    });

    expect(counts.cohortFirstMessages).toBe(1);
    expect(counts.cohortConversations).toBe(1);
    expect(counts.cohortValueContent).toBe(1);
    expect(counts.rates.response).toBe(1);
    expect(counts.rates.valueContent).toBe(1);
  });

  it("returns null for rates with no denominator", () => {
    const counts = computeCrmKpis({ period, events: [], calls: [], sales: [] });

    expect(counts.rates).toEqual({
      response: null,
      valueContent: null,
      callProposed: null,
      callBooked: null,
      attendance: null,
      noShow: null,
      closing: null,
    });
  });

  it("builds a UTC calendar-month period", () => {
    const result = currentCrmPeriod(new Date("2026-09-15T14:00:00Z"));
    expect(result.from.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(result.to.toISOString()).toBe("2026-09-30T23:59:59.999Z");
  });
});
