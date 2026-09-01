import type { CrmEventMetadata, CrmEventSource, CrmEventType, CrmLeadStage } from "./types";

export type CrmKpiEvent = {
  leadId: string;
  type: CrmEventType;
  actorUserId?: string | null;
  source?: CrmEventSource;
  occurredAt: Date | null;
  capturedAt: Date | null;
  createdAt: Date;
  metadata?: CrmEventMetadata;
};

export type CrmKpiCall = {
  leadId: string | null;
  scheduledAt: Date;
  attendance: "booked" | "showed" | "no_show" | "cancelled";
};

export type CrmKpiSale = { leadId: string | null; saleDate: string };

export type CrmKpiRates = {
  response: number | null;
  valueContent: number | null;
  callProposed: number | null;
  callBooked: number | null;
  attendance: number | null;
  noShow: number | null;
  closing: number | null;
};

export type CrmKpiCounts = {
  messages: number;
  responses: number;
  conversations: number;
  valueContent: number;
  callsProposed: number;
  callsBooked: number;
  callsAttended: number;
  noShows: number;
  sales: number;
  cohortFirstMessages: number;
  cohortConversations: number;
  cohortValueContent: number;
  cohortCallsProposed: number;
  cohortCallsBooked: number;
  cohortConverted: number;
  rates: CrmKpiRates;
  incomplete: boolean;
};

export type CrmKpiPeriod = { from: Date; to: Date };

const EVENT_KPI: Partial<Record<CrmEventType, keyof Pick<CrmKpiCounts, "messages" | "responses" | "conversations" | "valueContent" | "callsProposed" | "callsBooked">>> = {
  first_message_sent: "messages",
  response_received: "responses",
  conversation_started: "conversations",
  value_content_sent: "valueContent",
  call_proposed: "callsProposed",
  call_booked: "callsBooked",
};

const COHORT_MILESTONES = {
  conversation: "conversation_started",
  valueContent: "value_content_sent",
  callProposed: "call_proposed",
  callBooked: "call_booked",
} as const;

function eventDate(event: CrmKpiEvent): Date {
  return event.occurredAt ?? event.capturedAt ?? event.createdAt;
}

function inPeriod(value: Date, period: CrmKpiPeriod): boolean {
  return value >= period.from && value <= period.to;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function addCohortMilestone(map: Map<string, Set<string>>, milestone: string, leadId: string): void {
  const bucket = map.get(milestone) ?? new Set<string>();
  bucket.add(leadId);
  map.set(milestone, bucket);
}

export function computeCrmKpis(input: {
  events: CrmKpiEvent[];
  calls: CrmKpiCall[];
  sales: CrmKpiSale[];
  period: CrmKpiPeriod;
}): CrmKpiCounts {
  const buckets: Record<"messages" | "responses" | "conversations" | "valueContent" | "callsProposed" | "callsBooked", Set<string>> = {
    messages: new Set(),
    responses: new Set(),
    conversations: new Set(),
    valueContent: new Set(),
    callsProposed: new Set(),
    callsBooked: new Set(),
  };
  const firstMessageDates = new Map<string, Date>();
  const cohortMilestones = new Map<string, Set<string>>();
  const soldLeadIds = new Set<string>();
  const noShowEventLeadIds = new Set<string>();
  let hasPeriodData = false;

  for (const event of input.events) {
    const date = eventDate(event);
    const isInPeriod = inPeriod(date, input.period);
    if (isInPeriod) hasPeriodData = true;
    if (event.type === "first_message_sent" && isInPeriod) {
      const current = firstMessageDates.get(event.leadId);
      if (!current || date < current) firstMessageDates.set(event.leadId, date);
    }
    if (event.type === "sale_validated" && isInPeriod) soldLeadIds.add(event.leadId);
    if (event.type === "no_show_marked" && isInPeriod) noShowEventLeadIds.add(event.leadId);
    const bucket = EVENT_KPI[event.type];
    if (bucket && isInPeriod) buckets[bucket].add(event.leadId);
  }

  for (const event of input.events) {
    const firstMessageAt = firstMessageDates.get(event.leadId);
    if (!firstMessageAt) continue;
    const date = eventDate(event);
    if (date < firstMessageAt || date > input.period.to) continue;
    if (event.type === COHORT_MILESTONES.conversation) addCohortMilestone(cohortMilestones, "conversation", event.leadId);
    if (event.type === COHORT_MILESTONES.valueContent) addCohortMilestone(cohortMilestones, "valueContent", event.leadId);
    if (event.type === COHORT_MILESTONES.callProposed) addCohortMilestone(cohortMilestones, "callProposed", event.leadId);
    if (event.type === COHORT_MILESTONES.callBooked) addCohortMilestone(cohortMilestones, "callBooked", event.leadId);
  }

  let callsAttended = 0;
  let noShows = 0;
  const bookedLeadIds = new Set<string>();
  const noShowCallLeadIds = new Set<string>();
  for (const call of input.calls) {
    if (!inPeriod(call.scheduledAt, input.period)) continue;
    hasPeriodData = true;
    if (call.leadId && call.attendance !== "cancelled") bookedLeadIds.add(call.leadId);
    if (call.attendance === "showed") callsAttended += 1;
    if (call.attendance === "no_show") {
      noShows += 1;
      if (call.leadId) noShowCallLeadIds.add(call.leadId);
    }
  }
  noShows += [...noShowEventLeadIds].filter((leadId) => !noShowCallLeadIds.has(leadId)).length;
  for (const leadId of bookedLeadIds) buckets.callsBooked.add(leadId);

  for (const sale of input.sales) {
    const saleDate = new Date(`${sale.saleDate}T12:00:00.000Z`);
    if (sale.leadId && inPeriod(saleDate, input.period)) {
      hasPeriodData = true;
      soldLeadIds.add(sale.leadId);
    }
  }

  const cohortFirstMessages = firstMessageDates.size;
  const cohortConversations = cohortMilestones.get("conversation")?.size ?? 0;
  const cohortValueContent = cohortMilestones.get("valueContent")?.size ?? 0;
  const cohortCallsProposed = cohortMilestones.get("callProposed")?.size ?? 0;
  const cohortCallsBooked = cohortMilestones.get("callBooked")?.size ?? 0;
  const cohortConverted = new Set<string>();
  for (const milestone of cohortMilestones.values()) for (const leadId of milestone) cohortConverted.add(leadId);
  for (const leadId of soldLeadIds) if (firstMessageDates.has(leadId)) cohortConverted.add(leadId);

  return {
    messages: buckets.messages.size,
    responses: buckets.responses.size,
    conversations: buckets.conversations.size,
    valueContent: buckets.valueContent.size,
    callsProposed: buckets.callsProposed.size,
    callsBooked: buckets.callsBooked.size,
    callsAttended,
    noShows,
    sales: soldLeadIds.size,
    cohortFirstMessages,
    cohortConversations,
    cohortValueContent,
    cohortCallsProposed,
    cohortCallsBooked,
    cohortConverted: cohortConverted.size,
    rates: {
      response: ratio(cohortConversations, cohortFirstMessages),
      valueContent: ratio(cohortValueContent, cohortConversations),
      callProposed: ratio(cohortCallsProposed, cohortValueContent),
      callBooked: ratio(cohortCallsBooked, cohortCallsProposed),
      attendance: ratio(callsAttended, buckets.callsBooked.size),
      noShow: ratio(noShows, buckets.callsBooked.size),
      closing: ratio(soldLeadIds.size, callsAttended),
    },
    incomplete: !hasPeriodData,
  };
}

export function currentCrmPeriod(now = new Date()): CrmKpiPeriod {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  to.setMilliseconds(to.getMilliseconds() - 1);
  return { from, to };
}

export function stageIsOperational(stage: CrmLeadStage): boolean {
  return ["first_message_sent", "conversation_in_progress", "value_content_sent", "call_proposed", "call_booked"].includes(stage);
}
