import { describe, expect, it } from "vitest";

import {
  calculateCrmMessageAbTestResults,
  decideCrmMessageAbTestSend,
  CRM_MESSAGE_AB_TEST_MIN_MATURED_WINDOWS,
  CRM_MESSAGE_AB_TEST_WINDOW_MS,
  isCrmMessageAbTestEligibleCapture,
  pickCrmMessageAbTestVariant,
  renderCrmMessageAbTestMessage,
  transitionCrmMessageAbTest,
  type CrmMessageAbTestMetricAssignment,
  type CrmMessageAbTestMetricEvent,
} from "./message-ab-test-rules";

const sentAt = new Date("2026-09-01T12:00:00.000Z");
const matureAt = new Date(sentAt.getTime() + CRM_MESSAGE_AB_TEST_WINDOW_MS);

describe("CRM first-message A/B test rules", () => {
  it("assigns variants at an equal random threshold without accepting a client choice", () => {
    expect(pickCrmMessageAbTestVariant(0)).toBe("A");
    expect(pickCrmMessageAbTestVariant(0.49999)).toBe("A");
    expect(pickCrmMessageAbTestVariant(0.5)).toBe("B");
    expect(pickCrmMessageAbTestVariant(0.99999)).toBe("B");
  });

  it("resolves supported first-name tokens into the immutable per-lead message", () => {
    expect(renderCrmMessageAbTestMessage("Salut {prénom}, bonjour {prenom} / {first_name}", " Claire "))
      .toBe("Salut Claire, bonjour Claire / Claire");
    expect(renderCrmMessageAbTestMessage("{first_name} {first_name}", "Zoë $&"))
      .toBe("Zoë $& Zoë $&");
  });

  it("assigns only new Instagram and LinkedIn extension captures", () => {
    expect(isCrmMessageAbTestEligibleCapture({ source: "extension", contactState: "new", channel: "instagram" })).toBe(true);
    expect(isCrmMessageAbTestEligibleCapture({ source: "extension", contactState: "new", channel: "linkedin" })).toBe(true);
    expect(isCrmMessageAbTestEligibleCapture({ source: "extension", contactState: "contacted", channel: "instagram" })).toBe(false);
    expect(isCrmMessageAbTestEligibleCapture({ source: "app", contactState: "new", channel: "instagram" })).toBe(false);
    expect(isCrmMessageAbTestEligibleCapture({ source: "extension", contactState: "new", channel: "whatsapp" })).toBe(false);
  });

  it("allows pause, resume when the channel is free, and end; rejects invalid transitions", () => {
    expect(transitionCrmMessageAbTest("active", "pause")).toEqual({ ok: true, status: "paused" });
    expect(transitionCrmMessageAbTest("paused", "resume")).toEqual({ ok: true, status: "active" });
    expect(transitionCrmMessageAbTest("paused", "resume", true)).toEqual({ ok: false, reason: "channel_occupied" });
    expect(transitionCrmMessageAbTest("paused", "end")).toEqual({ ok: true, status: "ended" });
    expect(transitionCrmMessageAbTest("ended", "resume")).toEqual({ ok: false, reason: "invalid_transition" });
  });

  it("makes send retries idempotent and blocks unconfirmed sends after a test ends", () => {
    expect(decideCrmMessageAbTestSend({ sentAt, testStatus: "ended", contactState: "contacted", messageOccurredAt: sentAt }))
      .toBe("already_confirmed");
    expect(decideCrmMessageAbTestSend({ sentAt: null, testStatus: "ended", contactState: "new", messageOccurredAt: null }))
      .toBe("test_ended");
    expect(decideCrmMessageAbTestSend({ sentAt: null, testStatus: "paused", contactState: "new", messageOccurredAt: null }))
      .toBe("confirm");
    expect(decideCrmMessageAbTestSend({ sentAt: null, testStatus: "active", contactState: "contacted", messageOccurredAt: sentAt }))
      .toBe("already_contacted");
  });

  it("uses the inclusive 168-hour response boundary and deduplicates repeated events", () => {
    const assignments: CrmMessageAbTestMetricAssignment[] = [
      { leadId: "a-one", variant: "A", sentAt },
      { leadId: "a-two", variant: "A", sentAt },
      { leadId: "b-one", variant: "B", sentAt },
    ];
    const events: CrmMessageAbTestMetricEvent[] = [
      { leadId: "a-one", type: "response_received", occurredAt: matureAt },
      { leadId: "a-one", type: "response_received", occurredAt: matureAt },
      { leadId: "a-two", type: "response_received", occurredAt: new Date(matureAt.getTime() + 1) },
      { leadId: "b-one", type: "call_booked", occurredAt: new Date(sentAt.getTime() + 5 * 60 * 60 * 1000) },
    ];

    const result = calculateCrmMessageAbTestResults(assignments, events, matureAt);
    expect(result.A).toMatchObject({ assigned: 2, confirmedSent: 2, completedWindows: 2, responses: 1, responseRate: 50 });
    expect(result.B).toMatchObject({ assigned: 1, confirmedSent: 1, completedWindows: 1, responses: 0, appointments: 1 });
    expect(result.insufficientData).toBe(true);
    expect(result.winner).toBeNull();
  });

  it("excludes unconfirmed and still-observed leads from the response denominator", () => {
    const recentSentAt = new Date("2026-10-05T12:00:00.000Z");
    const assignments: CrmMessageAbTestMetricAssignment[] = [
      { leadId: "unsent", variant: "A", sentAt: null },
      { leadId: "observed", variant: "A", sentAt: recentSentAt },
    ];
    const events: CrmMessageAbTestMetricEvent[] = [
      { leadId: "observed", type: "response_received", occurredAt: new Date("2026-10-06T09:00:00.000Z") },
    ];
    const result = calculateCrmMessageAbTestResults(assignments, events, new Date("2026-10-06T12:00:00.000Z"));
    expect(result.A).toMatchObject({ assigned: 2, confirmedSent: 1, completedWindows: 0, responses: 0, inObservation: 1, responseRate: null });
  });

  it("excludes unconfirmed assignments from all metrics after a test ends", () => {
    const result = calculateCrmMessageAbTestResults([
      { leadId: "confirmed", variant: "A", sentAt },
      { leadId: "not-sent", variant: "A", sentAt: null },
    ], [], matureAt, "ended");
    expect(result.A).toMatchObject({ assigned: 1, confirmedSent: 1, completedWindows: 1 });
  });

  it("warns while either variant has fewer than fifty completed windows", () => {
    const assignments: CrmMessageAbTestMetricAssignment[] = Array.from({ length: CRM_MESSAGE_AB_TEST_MIN_MATURED_WINDOWS * 2 }, (_, index) => ({
      leadId: `lead-${index}`,
      variant: index < CRM_MESSAGE_AB_TEST_MIN_MATURED_WINDOWS ? "A" : "B",
      sentAt,
    }));
    expect(calculateCrmMessageAbTestResults(assignments, [], matureAt).insufficientData).toBe(false);
    expect(calculateCrmMessageAbTestResults(assignments.slice(0, -1), [], matureAt).insufficientData).toBe(true);
  });
});
