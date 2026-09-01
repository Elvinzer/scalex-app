import type { CrmEventType, CrmLeadOutcome, CrmLeadStage } from "./types";

export const CRM_STAGE_LABEL_KEYS: Record<CrmLeadStage, string> = {
  first_message_sent: "stages.firstMessageSent",
  conversation_in_progress: "stages.conversationInProgress",
  value_content_sent: "stages.valueContentSent",
  call_proposed: "stages.callProposed",
  call_booked: "stages.callBooked",
};

export const CRM_OUTCOME_LABEL_KEYS: Record<CrmLeadOutcome, string> = {
  none: "outcomes.none",
  no_show: "outcomes.noShow",
  lost: "outcomes.lost",
  sold: "outcomes.sold",
};

export const CRM_EVENT_LABEL_KEYS: Record<CrmEventType, string> = {
  lead_created: "events.leadCreated",
  profile_captured: "events.profileCaptured",
  message_received: "events.messageReceived",
  first_message_sent: "events.firstMessageSent",
  response_received: "events.responseReceived",
  conversation_started: "events.conversationStarted",
  value_content_sent: "events.valueContentSent",
  call_proposed: "events.callProposed",
  call_booked: "events.callBooked",
  stage_changed: "events.stageChanged",
  outcome_changed: "events.outcomeChanged",
  no_show_marked: "events.noShowMarked",
  lead_lost: "events.leadLost",
  lead_reopened: "events.leadReopened",
  sale_validated: "events.saleValidated",
  note_added: "events.noteAdded",
  action_created: "events.actionCreated",
  action_completed: "events.actionCompleted",
  action_cancelled: "events.actionCancelled",
  responsibility_changed: "events.responsibilityChanged",
  match_confirmed: "events.matchConfirmed",
};

export function eventForStage(stage: CrmLeadStage): CrmEventType {
  if (stage === "first_message_sent") return "first_message_sent";
  if (stage === "conversation_in_progress") return "conversation_started";
  return stage;
}

export function eventForOutcome(outcome: CrmLeadOutcome): CrmEventType {
  if (outcome === "no_show") return "no_show_marked";
  if (outcome === "lost") return "lead_lost";
  if (outcome === "sold") return "sale_validated";
  return "outcome_changed";
}

export function legacyStageForCrmStage(stage: CrmLeadStage): "nouveau_lead" | "conversation" | "rdv_fixe" {
  if (stage === "first_message_sent") return "nouveau_lead";
  if (stage === "call_proposed" || stage === "call_booked") return "rdv_fixe";
  return "conversation";
}

export function isTerminalOutcome(outcome: CrmLeadOutcome): boolean {
  return outcome === "lost" || outcome === "sold";
}

export function canChangeStage(from: CrmLeadStage, to: CrmLeadStage): boolean {
  // V1 deliberately allows a setter to correct any stage without resetting the
  // history or outcome. The append-only log records the correction.
  void from;
  void to;
  return true;
}

export function defaultStageAfterReopen(lastKnownStage: CrmLeadStage | null): CrmLeadStage {
  return lastKnownStage ?? "first_message_sent";
}
