// Must stay in sync with db/schema.ts's funnelStageEnum values (both list
// the same 6 strings independently — Drizzle enums aren't derived from TS types).
export type FunnelStageKey =
  | "outreachRate"
  | "responseRate"
  | "proposalRate"
  | "bookingRate"
  | "showUpRate"
  | "closingRate";

export type QuestionOption = { id: string; label: string };

export type Question = {
  id: string;
  text: string;
  options: QuestionOption[];
};

// Curated by the Scale X team, not the model — `when` is evaluated in code
// against the user's answers, and only the matching rules' cause/guidance
// text is handed to Claude as context. The model synthesizes the final
// wording, it never invents a cause or a number itself.
export type KnowledgeRule = {
  id: string;
  when: (answers: Record<string, string>) => boolean;
  cause: string;
  guidance: string;
};

export type StageKnowledge = {
  questions: Question[];
  rules: KnowledgeRule[];
};
