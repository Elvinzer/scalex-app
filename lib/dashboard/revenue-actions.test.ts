import { describe, expect, it } from "vitest";

import { buildRevenueActions, type RevenueActionAccess, type RevenueCallInput, type RevenueLeadInput } from "./revenue-actions";

const ALL_ACCESS: RevenueActionAccess = { pipeline: true, calls: true, booking: true };
const NOW = new Date("2026-08-06T12:00:00.000Z");

function lead(overrides: Partial<RevenueLeadInput> = {}): RevenueLeadInput {
  return {
    id: "lead-1",
    firstName: "Ada",
    lastName: "Lovelace",
    potentialValueEur: 2500,
    stage: "conversation",
    isNoShow: false,
    reminderDate: "2026-08-06",
    reminderNote: null,
    reminderDone: false,
    updatedAt: "2026-08-05T10:00:00.000Z",
    ...overrides,
  };
}

function call(overrides: Partial<RevenueCallInput> = {}): RevenueCallInput {
  return {
    id: "call-1",
    inviteeName: "Grace Hopper",
    inviteePhone: null,
    outcome: "awaiting_decision",
    decisionDueAt: "2026-08-05T10:00:00.000Z",
    ...overrides,
  };
}

describe("buildRevenueActions", () => {
  it("projects the four supported sources with stable source-based ids", () => {
    const actions = buildRevenueActions({
      calls: [call()],
      leads: [lead()],
      nativeBookingLeads: [
        {
          id: "native-1",
          status: "open",
          firstName: "Katherine",
          lastName: "Johnson",
          eventName: "Appel stratégique",
          lastStep: "slots_revealed",
          lastSeenAt: "2026-08-06T11:00:00.000Z",
        },
      ],
      permissions: ALL_ACCESS,
      now: NOW,
    });

    expect(actions.map((action) => action.id)).toEqual([
      "call_decision:call-1",
      "lead_reminder:lead-1",
      "native_booking_lead:native-1",
    ]);
    expect(actions[0]?.urgencyLabel).toBe("En retard de 1 j");
    expect(actions[1]?.urgencyLabel).toBe("À faire aujourd’hui");
    expect(actions[2]?.reason).toBe("Créneaux consultés sans réservation");
    expect(actions[1]?.href).toBe("/ventes/pipeline?lead=lead-1&from=dashboard");
  });

  it("prioritizes a no-show over the reminder attached to the same manual lead", () => {
    const actions = buildRevenueActions({
      calls: [],
      leads: [lead({ stage: "rdv_fixe", isNoShow: true, reminderDate: "2026-08-01" })],
      nativeBookingLeads: [],
      permissions: ALL_ACCESS,
      now: NOW,
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.source).toBe("lead_no_show");
    expect(actions[0]?.reason).toBe("No-show à récupérer");
  });

  it("orders overdue and dated actions deterministically before no-shows and native leads", () => {
    const actions = buildRevenueActions({
      calls: [call({ id: "call-future", decisionDueAt: "2026-08-10T10:00:00.000Z" }), call({ id: "call-old", decisionDueAt: "2026-08-01T10:00:00.000Z" })],
      leads: [
        lead({ id: "lead-no-show", stage: "rdv_fixe", isNoShow: true, reminderDate: null, updatedAt: "2026-08-03T10:00:00.000Z" }),
      ],
      nativeBookingLeads: [
        {
          id: "native-old",
          status: "contacted",
          firstName: null,
          lastName: null,
          eventName: "Appel",
          lastStep: "contact_submitted",
          lastSeenAt: "2026-08-04T10:00:00.000Z",
        },
      ],
      permissions: ALL_ACCESS,
      now: NOW,
    });

    expect(actions.map((action) => action.id)).toEqual([
      "call_decision:call-old",
      "call_decision:call-future",
      "lead_no_show:lead-no-show",
      "native_booking_lead:native-old",
    ]);
  });

  it("removes actions whose source destination is not accessible to the member", () => {
    const actions = buildRevenueActions({
      calls: [call()],
      leads: [lead()],
      nativeBookingLeads: [
        {
          id: "native-1",
          status: "open",
          firstName: "Prospect",
          lastName: "Test",
          eventName: "Appel",
          lastStep: "contact_submitted",
          lastSeenAt: "2026-08-06T11:00:00.000Z",
        },
      ],
      permissions: { pipeline: true, calls: false, booking: false },
      now: NOW,
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]?.source).toBe("lead_reminder");
    expect(actions.every((action) => !action.href.includes("native") && !action.href.includes("call"))).toBe(true);
  });

  it("does not put a future manual reminder in the current action queue", () => {
    const actions = buildRevenueActions({
      calls: [],
      leads: [lead({ reminderDate: "2026-08-07" })],
      nativeBookingLeads: [],
      permissions: ALL_ACCESS,
      now: NOW,
    });

    expect(actions).toEqual([]);
  });

  it("keeps a call phone in the Dashboard projection for contact actions", () => {
    const actions = buildRevenueActions({
      calls: [call({ inviteePhone: "+15551234567" })],
      leads: [lead()],
      nativeBookingLeads: [],
      permissions: ALL_ACCESS,
      now: NOW,
    });

    expect(actions[0]?.phone).toBe("+15551234567");
    expect(JSON.stringify(actions)).not.toContain("email");
  });
});
