import { bookingRateKnowledge } from "./booking-rate";
import { closingRateKnowledge } from "./closing-rate";
import { outreachRateKnowledge } from "./outreach-rate";
import { proposalRateKnowledge } from "./proposal-rate";
import { responseRateKnowledge } from "./response-rate";
import { showUpRateKnowledge } from "./show-up-rate";
import type { FunnelStageKey, StageKnowledge } from "./types";

export const STAGE_KNOWLEDGE: Record<FunnelStageKey, StageKnowledge> = {
  outreachRate: outreachRateKnowledge,
  responseRate: responseRateKnowledge,
  proposalRate: proposalRateKnowledge,
  bookingRate: bookingRateKnowledge,
  showUpRate: showUpRateKnowledge,
  closingRate: closingRateKnowledge,
};

export const STAGE_TITLES: Record<FunnelStageKey, string> = {
  outreachRate: "Taux de prise de contact",
  responseRate: "Taux de réponse au 1er message",
  proposalRate: "Taux de proposition d'appel",
  bookingRate: "Taux d'appels acceptés (sur proposés)",
  showUpRate: "Taux de présence à l'appel (show-up)",
  closingRate: "Taux de closing",
};

export type { FunnelStageKey, Question, StageKnowledge } from "./types";
