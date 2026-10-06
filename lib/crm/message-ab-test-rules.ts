export const CRM_MESSAGE_AB_TEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
export const CRM_MESSAGE_AB_TEST_MIN_MATURED_WINDOWS = 50;

export type CrmMessageAbTestStatus = "active" | "paused" | "ended";
export type CrmMessageAbTestChannel = "instagram" | "linkedin";
export type CrmMessageAbTestVariant = "A" | "B";
export type CrmMessageAbTestAction = "pause" | "resume" | "end";
export type CrmMessageAbTestSendDecision = "confirm" | "already_confirmed" | "test_ended" | "already_contacted";

export type CrmMessageAbTestMetrics = {
  assigned: number;
  confirmedSent: number;
  completedWindows: number;
  responses: number;
  inObservation: number;
  appointments: number;
  responseRate: number | null;
};

export type CrmMessageAbTestResults = {
  A: CrmMessageAbTestMetrics;
  B: CrmMessageAbTestMetrics;
  insufficientData: boolean;
  winner: null;
};

export type CrmMessageAbTestMetricEvent = {
  leadId: string;
  type: "response_received" | "call_booked";
  occurredAt: Date | null;
};

export type CrmMessageAbTestMetricAssignment = {
  leadId: string;
  variant: CrmMessageAbTestVariant;
  sentAt: Date | null;
};

const emptyMetrics = (): CrmMessageAbTestMetrics => ({
  assigned: 0,
  confirmedSent: 0,
  completedWindows: 0,
  responses: 0,
  inObservation: 0,
  appointments: 0,
  responseRate: null,
});

export function pickCrmMessageAbTestVariant(sample = Math.random()): CrmMessageAbTestVariant {
  return sample < 0.5 ? "A" : "B";
}

export function renderCrmMessageAbTestMessage(template: string, firstName: string): string {
  const safeFirstName = firstName.trim();
  return template.replace(/\{(?:first_name|prenom|prénom)\}/gi, () => safeFirstName);
}

export function isCrmMessageAbTestEligibleCapture(input: {
  source: string;
  contactState: string;
  channel: string;
  messageOccurredAt?: string | null;
}): input is { source: "extension"; contactState: "new"; channel: CrmMessageAbTestChannel; messageOccurredAt?: null } {
  return input.source === "extension"
    && input.contactState === "new"
    && !input.messageOccurredAt
    && (input.channel === "instagram" || input.channel === "linkedin");
}

export function transitionCrmMessageAbTest(
  current: CrmMessageAbTestStatus,
  action: CrmMessageAbTestAction,
  channelOccupied = false,
): { ok: true; status: CrmMessageAbTestStatus } | { ok: false; reason: "invalid_transition" | "channel_occupied" } {
  if (action === "pause" && current === "active") return { ok: true, status: "paused" };
  if (action === "pause" && current === "paused") return { ok: true, status: "paused" };
  if (action === "resume" && current === "paused") {
    return channelOccupied ? { ok: false, reason: "channel_occupied" } : { ok: true, status: "active" };
  }
  if (action === "resume" && current === "active") return { ok: true, status: "active" };
  if (action === "end" && current !== "ended") return { ok: true, status: "ended" };
  if (action === "end" && current === "ended") return { ok: true, status: "ended" };
  return { ok: false, reason: "invalid_transition" };
}

export function decideCrmMessageAbTestSend(input: {
  sentAt: Date | null;
  testStatus: CrmMessageAbTestStatus;
  contactState: string;
  messageOccurredAt: Date | null;
}): CrmMessageAbTestSendDecision {
  if (input.sentAt) return "already_confirmed";
  if (input.testStatus === "ended") return "test_ended";
  if (input.contactState !== "new" || input.messageOccurredAt) return "already_contacted";
  return "confirm";
}

export function calculateCrmMessageAbTestResults(
  assignments: readonly CrmMessageAbTestMetricAssignment[],
  events: readonly CrmMessageAbTestMetricEvent[],
  now = new Date(),
  testStatus: CrmMessageAbTestStatus = "active",
): CrmMessageAbTestResults {
  const byLead = new Map<string, CrmMessageAbTestMetricEvent[]>();
  for (const event of events) {
    if (!event.occurredAt) continue;
    const current = byLead.get(event.leadId) ?? [];
    current.push(event);
    byLead.set(event.leadId, current);
  }

  const metrics: Record<CrmMessageAbTestVariant, CrmMessageAbTestMetrics> = { A: emptyMetrics(), B: emptyMetrics() };
  for (const assignment of assignments) {
    if (testStatus === "ended" && !assignment.sentAt) continue;
    const variantMetrics = metrics[assignment.variant];
    variantMetrics.assigned += 1;
    if (!assignment.sentAt) continue;

    variantMetrics.confirmedSent += 1;
    const sentAtMs = assignment.sentAt.getTime();
    const endsAtMs = sentAtMs + CRM_MESSAGE_AB_TEST_WINDOW_MS;
    const windowEvents = (byLead.get(assignment.leadId) ?? []).filter((event) => {
      const occurredAtMs = event.occurredAt?.getTime();
      return occurredAtMs !== undefined && occurredAtMs >= sentAtMs && occurredAtMs <= endsAtMs;
    });
    if (windowEvents.some((event) => event.type === "call_booked")) variantMetrics.appointments += 1;
    if (now.getTime() >= endsAtMs) {
      variantMetrics.completedWindows += 1;
      if (windowEvents.some((event) => event.type === "response_received")) variantMetrics.responses += 1;
    } else {
      variantMetrics.inObservation += 1;
    }
  }

  for (const variant of ["A", "B"] as const) {
    const variantMetrics = metrics[variant];
    variantMetrics.responseRate = variantMetrics.completedWindows > 0
      ? Math.round((variantMetrics.responses / variantMetrics.completedWindows) * 1000) / 10
      : null;
  }

  return {
    A: metrics.A,
    B: metrics.B,
    insufficientData: metrics.A.completedWindows < CRM_MESSAGE_AB_TEST_MIN_MATURED_WINDOWS
      || metrics.B.completedWindows < CRM_MESSAGE_AB_TEST_MIN_MATURED_WINDOWS,
    winner: null,
  };
}
