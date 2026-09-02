export const CRM_PLATFORMS = ["instagram", "linkedin"] as const;
export type CrmPlatform = (typeof CRM_PLATFORMS)[number];

export const CRM_LEAD_STAGES = [
  "first_message_sent",
  "conversation_in_progress",
  "value_content_sent",
  "call_proposed",
  "call_booked",
] as const;
export type CrmLeadStage = (typeof CRM_LEAD_STAGES)[number];

export const CRM_LEAD_OUTCOMES = ["none", "no_show", "lost", "sold"] as const;
export type CrmLeadOutcome = (typeof CRM_LEAD_OUTCOMES)[number];

export const CRM_LEAD_SOURCES = [
  "instagram",
  "tiktok",
  "youtube",
  "linkedin",
  "x",
  "facebook",
  "email_newsletter",
  "ads",
  "bouche_a_oreille",
  "autre",
] as const;
export type CrmLeadSource = (typeof CRM_LEAD_SOURCES)[number];

export const CRM_ACTION_CATEGORIES = ["prospecting", "sales", "appointment"] as const;
export type CrmActionCategory = (typeof CRM_ACTION_CATEGORIES)[number];

export const CRM_ACTION_STATUSES = ["open", "completed", "cancelled"] as const;
export type CrmActionStatus = (typeof CRM_ACTION_STATUSES)[number];

export const CRM_EVENT_SOURCES = ["app", "extension", "migration", "system"] as const;
export type CrmEventSource = (typeof CRM_EVENT_SOURCES)[number];

export const CRM_EVENT_TYPES = [
  "lead_created",
  "profile_captured",
  "message_received",
  "first_message_sent",
  "response_received",
  "conversation_started",
  "value_content_sent",
  "call_proposed",
  "call_booked",
  "stage_changed",
  "outcome_changed",
  "no_show_marked",
  "lead_lost",
  "lead_reopened",
  "sale_validated",
  "note_added",
  "action_created",
  "action_completed",
  "action_cancelled",
  "responsibility_changed",
  "match_confirmed",
] as const;
export type CrmEventType = (typeof CRM_EVENT_TYPES)[number];

export type CrmEventMetadata = Record<string, string | number | boolean | null>;

export const CRM_CALL_MATCH_STATUSES = [
  "queued",
  "ready",
  "ambiguous",
  "no_match",
  "unavailable",
  "failed",
  "expired",
  "accepted",
  "rejected",
  "dismissed",
] as const;
export type CrmCallMatchStatus = (typeof CRM_CALL_MATCH_STATUSES)[number];

export const CRM_CALL_MATCH_DECISIONS = ["accepted", "rejected", "dismissed"] as const;
export type CrmCallMatchDecision = (typeof CRM_CALL_MATCH_DECISIONS)[number];

export const CRM_CALL_MATCH_CONFIDENCES = ["high", "medium", "low"] as const;
export type CrmCallMatchConfidence = (typeof CRM_CALL_MATCH_CONFIDENCES)[number];

export const CRM_CALL_MATCH_REASON_CODES = [
  "exact_email",
  "exact_phone",
  "exact_profile",
  "name_match",
  "time_proximity",
  "platform_match",
  "attribution_match",
  "event_type_match",
  "missing_contact",
  "common_name",
  "no_candidate",
] as const;
export type CrmCallMatchReasonCode = (typeof CRM_CALL_MATCH_REASON_CODES)[number];

export type CrmCallMatchReason = {
  code: CrmCallMatchReasonCode;
  label: string;
};

export type CrmCallMatchCandidateView = {
  id: string;
  leadId: string;
  leadName: string;
  leadHandle: string | null;
  leadProfileUrl: string | null;
  rank: number;
  score: number;
  confidence: CrmCallMatchConfidence;
  reasonCodes: CrmCallMatchReasonCode[];
  reasons: CrmCallMatchReason[];
  missingEvidence: string[];
};

export type CrmCallMatchSuggestionView = {
  id: string;
  status: CrmCallMatchStatus;
  confidence: CrmCallMatchConfidence | null;
  candidates: CrmCallMatchCandidateView[];
  generatedAt: string | null;
  expiresAt: string | null;
  modelVersion: string | null;
  failureCode: string | null;
};

export type CrmReportingPeriod = {
  from: string;
  to: string;
  label: string;
};

export type CrmLeadListItem = {
  id: string;
  accountId: string;
  platform: CrmPlatform | null;
  canonicalProfileUrl: string | null;
  normalizedHandle: string | null;
  displayName: string;
  firstName: string;
  lastName: string;
  source: string;
  offerId: string | null;
  potentialValueEur: number;
  closer: string | null;
  saleId: string | null;
  stage: CrmLeadStage;
  outcome: CrmLeadOutcome;
  isNoShow: boolean;
  responsibleSetterId: string | null;
  responsibleSetterName: string | null;
  createdAt: string;
  updatedAt: string;
  messageOccurredAt: string | null;
  capturedAt: string | null;
  nextAction: { id: string; title: string; dueAt: string; category: CrmActionCategory } | null;
};

export type CrmLeadEventView = {
  id: string;
  type: CrmEventType;
  source: CrmEventSource;
  actorUserId: string | null;
  occurredAt: string | null;
  capturedAt: string | null;
  createdAt: string;
  metadata: CrmEventMetadata;
  actorName?: string | null;
};

export type CrmStageHistoryView = {
  id: string;
  fromStage: CrmLeadStage | null;
  toStage: CrmLeadStage;
  actorUserId: string | null;
  responsibleSetterId: string | null;
  source: CrmEventSource;
  changedAt: string;
  actorName?: string | null;
  responsibleSetterName?: string | null;
};

export type CrmResponsibilityHistoryView = {
  id: string;
  previousSetterId: string | null;
  nextSetterId: string | null;
  actorUserId: string | null;
  changedAt: string;
};

export type CrmActionView = {
  id: string;
  leadId: string;
  leadName: string;
  category: CrmActionCategory;
  type: string;
  title: string;
  dueAt: string;
  status: CrmActionStatus;
  priority: number;
  responsibleUserId: string | null;
  responsibleName: string | null;
  createdByUserId: string | null;
  completedAt: string | null;
  completedByUserId: string | null;
  source: CrmEventSource;
  sourceId: string | null;
};

export type CrmCallView = {
  id: string;
  leadId: string | null;
  leadName: string | null;
  leadProfileUrl: string | null;
  source: string;
  inviteeName: string | null;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  scheduledAt: string;
  durationMinutes: number | null;
  eventType: string | null;
  externalReference: string;
  nativeBookingId: string | null;
  attendance: "booked" | "showed" | "no_show" | "cancelled";
  outcome: "pending" | "closed" | "not_closed" | "awaiting_decision";
  closer: string | null;
  confidence: string | null;
  responsibleName: string | null;
  suggestion: CrmCallMatchSuggestionView | null;
};

export type CrmLeadDetails = CrmLeadListItem & {
  comments: Array<{ id: string; userId: string; body: string; createdAt: string; authorName: string | null }>;
  events: CrmLeadEventView[];
  stageHistory: CrmStageHistoryView[];
  responsibilityHistory: CrmResponsibilityHistoryView[];
  actions: CrmActionView[];
  calls: CrmCallView[];
};

export type CrmProfileResolution =
  | { kind: "unknown"; profile: CrmCapturedProfile }
  | { kind: "known"; lead: CrmLeadListItem }
  | { kind: "ambiguous"; profile: CrmCapturedProfile; candidates: CrmLeadListItem[] };

export type CrmCapturedProfile = {
  platform: CrmPlatform;
  canonicalProfileUrl: string;
  normalizedHandle: string;
  displayName: string;
  firstName: string;
  lastName: string;
  messageOccurredAt: string | null;
  capturedAt: string;
};
