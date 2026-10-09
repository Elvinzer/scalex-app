import type { CrmEventMetadata, CrmEventSource, CrmEventType, CrmLeadOutcome, CrmLeadStage, CrmPlatform } from "./types";

export type CrmKpiEvent = {
  leadId: string;
  type: CrmEventType;
  actorUserId?: string | null;
  source?: CrmEventSource;
  sourceEventKey?: string | null;
  occurredAt: Date | null;
  capturedAt: Date | null;
  createdAt: Date;
  metadata?: CrmEventMetadata;
  includeInCohort?: boolean;
};

export type CrmKpiStageChange = {
  leadId: string;
  fromStage: CrmLeadStage | null;
  toStage: CrmLeadStage;
  actorUserId?: string | null;
  responsibleSetterId?: string | null;
  occurredAt: Date;
  currentSnapshot?: boolean;
  currentOutcome?: CrmLeadOutcome;
  currentContactState?: "new" | "contacted";
  leadCreatedAt?: Date | null;
  includeInCurrentCounts?: boolean;
  includeInCohort?: boolean;
};

export type CrmKpiCall = {
  leadId: string | null;
  scheduledAt: Date;
  bookedAt?: Date | null;
  attendance: "booked" | "showed" | "no_show" | "cancelled";
};

export type CrmKpiSale = { leadId: string | null; saleDate: string; totalPrice?: number };

export type CrmKpiRates = {
  response: number | null;
  qualification: number | null;
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
  qualificationNotes: number;
  conversations: number;
  valueContent: number;
  callsProposed: number;
  callsBooked: number;
  callsAttended: number;
  noShows: number;
  sales: number;
  revenue: number;
  cohortFirstMessages: number;
  cohortConversations: number;
  cohortValueContent: number;
  cohortCallsProposed: number;
  cohortCallsBooked: number;
  cohortConverted: number;
  rates: CrmKpiRates;
};

export type CrmKpiPeriod = { from: Date; to: Date };

export type CrmKpiAttribution = {
  platform: CrmPlatform | null;
  offerId: string | null;
  source: string;
  setterId: string | null;
};

export type CrmKpiAttributionFilters = {
  platform?: CrmPlatform;
  offerId?: string;
  source?: string;
};

export function matchesCrmKpiAttribution(lead: CrmKpiAttribution, filters: CrmKpiAttributionFilters): boolean {
  if (filters.platform && lead.platform !== filters.platform) return false;
  if (filters.offerId && lead.offerId !== filters.offerId) return false;
  if (filters.source && lead.source !== filters.source) return false;
  return true;
}

export function isCrmKpiEventAttributedToSetter(
  event: { actorUserId?: string | null; metadata?: CrmEventMetadata },
  setterId: string,
  setterActorUserId?: string | null,
): boolean {
  return event.metadata?.responsibleSetterId === setterId || Boolean(setterActorUserId && event.actorUserId === setterActorUserId);
}

export const CRM_PRIMARY_KPI_METRICS = [
  "messages",
  "conversations",
  "valueContent",
  "responses",
  "callsProposed",
  "callsBooked",
] as const;

export type CrmPrimaryKpiMetric = (typeof CRM_PRIMARY_KPI_METRICS)[number];

export function getCrmPrimaryKpiPresentation(
  kpis: CrmKpiCounts,
  key: CrmPrimaryKpiMetric,
  personalScopeUnavailable: boolean,
  notMeasuredLabel: string,
): { displayValue: string; isMeasured: boolean } {
  const isCount = key === "messages" || key === "conversations" || key === "valueContent";
  const value = isCount
    ? kpis[key]
    : kpis.rates[key === "responses" ? "response" : key === "callsProposed" ? "callProposed" : "callBooked"];
  const isMeasured = !personalScopeUnavailable && typeof value === "number";

  return {
    displayValue: isMeasured ? `${Math.round(value * (isCount ? 1 : 100))}${isCount ? "" : "%"}` : notMeasuredLabel,
    isMeasured,
  };
}

export function resolveCrmKpiSetterId(input: {
  teamView: boolean;
  selectedSetterId?: string | null;
  personalSetterId?: string | null;
}): string | null | undefined {
  if (input.teamView) return input.selectedSetterId || undefined;
  return input.personalSetterId ?? null;
}

const EVENT_STAGE: Partial<Record<CrmEventType, CrmLeadStage>> = {
  first_message_sent: "first_message_sent",
  conversation_started: "conversation_in_progress",
  value_content_sent: "value_content_sent",
  call_proposed: "call_proposed",
  call_booked: "call_booked",
};

function eventDate(event: CrmKpiEvent): Date {
  return event.occurredAt ?? event.capturedAt ?? event.createdAt;
}

function conversionDate(event: CrmKpiEvent): Date {
  if (event.type === "call_booked" && event.metadata?.bookingMode === "native_crm") {
    return event.capturedAt ?? event.createdAt;
  }
  return eventDate(event);
}

function inPeriod(value: Date, period: CrmKpiPeriod): boolean {
  return value >= period.from && value <= period.to;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function isReliableFirstMessageEvent(event: CrmKpiEvent): boolean {
  return event.type === "first_message_sent" && (
    event.metadata?.confirmedFrom === "crm"
    || event.metadata?.confirmedFrom === "capture"
    || event.metadata?.selectedAtCapture === true
    || event.metadata?.source === "crm_import"
    || (
      event.source === "migration"
      && event.occurredAt !== null
      && event.sourceEventKey === `migration:first-message:${event.leadId}`
    )
  );
}

export function isLegacyCaptureFirstMessageEvent(event: Pick<CrmKpiEvent, "type" | "metadata">): boolean {
  return event.type === "first_message_sent" && event.metadata?.selectedAtCapture === true;
}

export function computeCrmKpis(input: {
  events: CrmKpiEvent[];
  stageChanges?: CrmKpiStageChange[];
  calls: CrmKpiCall[];
  sales: CrmKpiSale[];
  period: CrmKpiPeriod;
  asOf?: Date;
}): CrmKpiCounts {
  const asOf = input.asOf ?? input.period.to;
  const periodResponseLeadIds = new Set<string>();
  const periodCallProposedLeadIds = new Set<string>();
  const periodCallBookedLeadIds = new Set<string>();
  const qualificationLeadIds = new Set<string>();
  const firstMessageDates = new Map<string, Date>();
  const datedFirstMessageLeadIds = new Set<string>();
  const responsesAfterFirstMessage = new Set<string>();
  const valueContentAfterFirstMessage = new Set<string>();
  const callsProposedAfterFirstMessage = new Set<string>();
  const callsBookedAfterFirstMessage = new Set<string>();
  const soldLeadIds = new Set<string>();
  const noShowEventLeadIds = new Set<string>();
  const currentStages = new Map<string, { stage: CrmLeadStage; outcome?: CrmLeadOutcome; contactState?: "new" | "contacted"; changedAt: Date; leadCreatedAt?: Date | null; includeInCurrentCounts?: boolean }>();
  const stageChanges = (input.stageChanges ?? [])
    .filter((change) => change.occurredAt <= asOf)
    .sort((left, right) => left.occurredAt.getTime() - right.occurredAt.getTime());
  let revenue = 0;

  for (const change of stageChanges) {
    if (change.currentSnapshot || change.fromStage !== null || change.toStage !== "first_message_sent") continue;
    datedFirstMessageLeadIds.add(change.leadId);
    if (change.includeInCohort !== false && inPeriod(change.occurredAt, input.period)) {
      const previous = firstMessageDates.get(change.leadId);
      if (!previous || change.occurredAt < previous) firstMessageDates.set(change.leadId, change.occurredAt);
    }
  }

  for (const event of input.events) {
    const date = conversionDate(event);
    if (date > asOf) continue;
    const selectedPeriod = inPeriod(eventDate(event), input.period);

    if (event.type === "first_message_sent") {
      if (isReliableFirstMessageEvent(event)) {
        datedFirstMessageLeadIds.add(event.leadId);
        if (selectedPeriod && event.includeInCohort !== false) {
          const previous = firstMessageDates.get(event.leadId);
          if (!previous || date < previous) firstMessageDates.set(event.leadId, date);
        }
      }
    }

    if (event.type === "response_received" && selectedPeriod) periodResponseLeadIds.add(event.leadId);
    if (event.type === "call_proposed" && selectedPeriod) periodCallProposedLeadIds.add(event.leadId);
    if (event.type === "call_booked" && inPeriod(date, input.period)) periodCallBookedLeadIds.add(event.leadId);
    if (event.type === "sale_validated" && selectedPeriod) soldLeadIds.add(event.leadId);
    if (event.type === "qualification_updated" && selectedPeriod) qualificationLeadIds.add(event.leadId);
    if (event.type === "no_show_marked" && selectedPeriod) noShowEventLeadIds.add(event.leadId);
  }

  for (const change of stageChanges) {
    if (change.currentSnapshot) {
      currentStages.set(change.leadId, {
        stage: change.toStage,
        outcome: change.currentOutcome,
        contactState: change.currentContactState,
        changedAt: change.occurredAt,
        leadCreatedAt: change.leadCreatedAt,
        includeInCurrentCounts: change.includeInCurrentCounts,
      });
      continue;
    }
    const previous = currentStages.get(change.leadId);
    if (!previous || change.occurredAt >= previous.changedAt) {
      currentStages.set(change.leadId, { stage: change.toStage, changedAt: change.occurredAt });
    }
    if (
      change.fromStage === "first_message_sent"
      && change.toStage === "conversation_in_progress"
      && inPeriod(change.occurredAt, input.period)
    ) {
      periodResponseLeadIds.add(change.leadId);
    }
    if (change.toStage === "call_proposed" && inPeriod(change.occurredAt, input.period)) periodCallProposedLeadIds.add(change.leadId);
    if (change.toStage === "call_booked" && inPeriod(change.occurredAt, input.period)) periodCallBookedLeadIds.add(change.leadId);
  }

  const advancedStagesWithoutCohort = new Set<CrmLeadStage>([
    "conversation_in_progress",
    "value_content_sent",
    "call_proposed",
    "call_booked",
  ]);
  for (const [leadId, current] of currentStages) {
    if (datedFirstMessageLeadIds.has(leadId) || current.includeInCurrentCounts === false) continue;
    if (current.contactState !== "contacted" && !advancedStagesWithoutCohort.has(current.stage)) continue;
    const leadCreatedAt = current.leadCreatedAt;
    if (!leadCreatedAt || leadCreatedAt > asOf || !inPeriod(leadCreatedAt, input.period)) continue;
    firstMessageDates.set(leadId, leadCreatedAt);
  }

  for (const event of input.events) {
    const messageAt = firstMessageDates.get(event.leadId);
    if (!messageAt) continue;
    const date = conversionDate(event);
    if (date < messageAt || date > asOf || !inPeriod(date, input.period)) continue;

    if (event.type === "response_received") responsesAfterFirstMessage.add(event.leadId);
    if (event.type === "value_content_sent") valueContentAfterFirstMessage.add(event.leadId);
    if (event.type === "call_proposed") callsProposedAfterFirstMessage.add(event.leadId);
    if (event.type === "call_booked") callsBookedAfterFirstMessage.add(event.leadId);

    const eventStage = EVENT_STAGE[event.type];
    const existingStage = currentStages.get(event.leadId);
    if (eventStage && (!existingStage || date > existingStage.changedAt)) {
      currentStages.set(event.leadId, { stage: eventStage, changedAt: date });
    }
  }

  for (const change of stageChanges) {
    if (change.currentSnapshot) continue;
    const messageAt = firstMessageDates.get(change.leadId);
    if (!messageAt || change.occurredAt < messageAt || !inPeriod(change.occurredAt, input.period)) continue;
    if (change.fromStage === "first_message_sent" && change.toStage === "conversation_in_progress") {
      responsesAfterFirstMessage.add(change.leadId);
    }
    if (change.toStage === "value_content_sent") valueContentAfterFirstMessage.add(change.leadId);
    if (change.toStage === "call_proposed") callsProposedAfterFirstMessage.add(change.leadId);
    if (change.toStage === "call_booked") callsBookedAfterFirstMessage.add(change.leadId);
  }

  let callsAttended = 0;
  let noShows = 0;
  const bookedLeadIds = new Set<string>();
  const attendedLeadIds = new Set<string>();
  const noShowCallLeadIds = new Set<string>();
  const noShowLeadIds = new Set<string>();
  for (const call of input.calls) {
    if (inPeriod(call.scheduledAt, input.period)) {
      if (call.leadId && call.attendance !== "cancelled") bookedLeadIds.add(call.leadId);
      if (call.attendance === "showed") {
        callsAttended += 1;
        if (call.leadId) attendedLeadIds.add(call.leadId);
      }
      if (call.attendance === "no_show") {
        noShows += 1;
        if (call.leadId) {
          noShowCallLeadIds.add(call.leadId);
          noShowLeadIds.add(call.leadId);
        }
      }
    }

    const messageAt = call.leadId ? firstMessageDates.get(call.leadId) : undefined;
    const bookedAt = call.bookedAt ?? call.scheduledAt;
    if (call.leadId && messageAt && bookedAt >= messageAt && bookedAt <= asOf && inPeriod(bookedAt, input.period)) {
      callsBookedAfterFirstMessage.add(call.leadId);
    }
    if (call.leadId && inPeriod(bookedAt, input.period)) periodCallBookedLeadIds.add(call.leadId);
  }

  for (const leadId of noShowEventLeadIds) {
    if (noShowCallLeadIds.has(leadId)) continue;
    noShows += 1;
    noShowLeadIds.add(leadId);
    bookedLeadIds.add(leadId);
  }
  for (const leadId of bookedLeadIds) periodCallBookedLeadIds.add(leadId);

  for (const sale of input.sales) {
    const saleDate = new Date(`${sale.saleDate}T12:00:00.000Z`);
    if (sale.leadId && inPeriod(saleDate, input.period)) {
      soldLeadIds.add(sale.leadId);
      revenue += sale.totalPrice ?? 0;
    }
  }

  const cohortFirstMessages = firstMessageDates.size;
  const cohortConversations = responsesAfterFirstMessage.size;
  const cohortValueContent = valueContentAfterFirstMessage.size;
  const cohortCallsProposed = callsProposedAfterFirstMessage.size;
  const cohortCallsBooked = callsBookedAfterFirstMessage.size;
  const currentConversationIds = new Set<string>();
  const currentValueContentIds = new Set<string>();
  for (const leadId of firstMessageDates.keys()) {
    const current = currentStages.get(leadId);
    if (!current || current.includeInCurrentCounts === false || current.outcome === "lost" || current.outcome === "sold") continue;
    if (current.stage === "conversation_in_progress") currentConversationIds.add(leadId);
    if (current.stage === "value_content_sent") currentValueContentIds.add(leadId);
  }

  const cohortConverted = new Set<string>([
    ...responsesAfterFirstMessage,
    ...valueContentAfterFirstMessage,
    ...callsProposedAfterFirstMessage,
    ...callsBookedAfterFirstMessage,
  ]);
  for (const leadId of soldLeadIds) if (firstMessageDates.has(leadId)) cohortConverted.add(leadId);
  return {
    messages: cohortFirstMessages,
    responses: periodResponseLeadIds.size,
    qualificationNotes: qualificationLeadIds.size,
    conversations: currentConversationIds.size,
    valueContent: currentValueContentIds.size,
    callsProposed: periodCallProposedLeadIds.size,
    callsBooked: periodCallBookedLeadIds.size,
    callsAttended,
    noShows,
    sales: soldLeadIds.size,
    revenue,
    cohortFirstMessages,
    cohortConversations,
    cohortValueContent,
    cohortCallsProposed,
    cohortCallsBooked,
    cohortConverted: cohortConverted.size,
    rates: {
      response: ratio(cohortConversations, cohortFirstMessages),
      qualification: null,
      valueContent: ratio(cohortValueContent, cohortConversations),
      callProposed: ratio(cohortCallsProposed, cohortFirstMessages),
      callBooked: ratio(cohortCallsBooked, cohortFirstMessages),
      attendance: ratio([...attendedLeadIds].filter((leadId) => periodCallBookedLeadIds.has(leadId)).length, periodCallBookedLeadIds.size),
      noShow: ratio([...noShowLeadIds].filter((leadId) => periodCallBookedLeadIds.has(leadId)).length, periodCallBookedLeadIds.size),
      closing: ratio([...soldLeadIds].filter((leadId) => attendedLeadIds.has(leadId)).length, attendedLeadIds.size),
    },
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
