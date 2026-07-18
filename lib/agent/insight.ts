import Anthropic from "@anthropic-ai/sdk";

import { STAGE_KNOWLEDGE } from "./knowledge";
import type { FunnelStageKey } from "./knowledge/types";

// Bump here when the model needs updating — single point of change.
const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 400;

const SYSTEM_PROMPT =
  "Tu es l'agent Scale X, un coach opérationnel pour infopreneurs US qui vendent du " +
  "coaching/consulting B2B haut ticket. Tu écris un insight court (3 à 4 phrases maximum), " +
  "concret et directement actionnable, en français, en tutoyant l'utilisateur. Base-toi " +
  "UNIQUEMENT sur les causes et pistes d'action fournies dans le message — n'invente jamais " +
  "une cause ou un chiffre qui n'y figure pas. Si plusieurs causes correspondent, priorise la " +
  "plus actionnable et mentionne les autres brièvement.";

export type GenerateStageInsightInput = {
  stage: FunnelStageKey;
  ratePercent: number;
  answers: Record<string, string>;
  apiKey: string;
};

export type GenerateStageInsightResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

// The numbers and matching knowledge-base rules are all computed/selected in
// code before this call — Claude only synthesizes the wording, per
// CLAUDE.md's "ne jamais pré-agréger côté LLM" rule.
export async function generateStageInsight({
  stage,
  ratePercent,
  answers,
  apiKey,
}: GenerateStageInsightInput): Promise<GenerateStageInsightResult> {
  const knowledge = STAGE_KNOWLEDGE[stage];
  const matchingRules = knowledge.rules.filter((rule) => rule.when(answers));

  const answersSummary = knowledge.questions
    .map((question) => {
      const option = question.options.find((candidate) => candidate.id === answers[question.id]);
      return `- ${question.text} → ${option?.label ?? "(sans réponse)"}`;
    })
    .join("\n");

  const rulesSummary =
    matchingRules.length > 0
      ? matchingRules
          .map((rule) => `- Cause possible : ${rule.cause}\n  Piste d'action : ${rule.guidance}`)
          .join("\n")
      : "- Aucune cause connue ne correspond exactement aux réponses fournies.";

  const client = new Anthropic({ apiKey });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `Taux actuel de l'utilisateur : ${ratePercent}%.\n\n` +
          `Réponses au questionnaire :\n${answersSummary}\n\n` +
          `Causes probables identifiées par notre base de connaissance :\n${rulesSummary}\n\n` +
          "Écris l'insight à destination de l'utilisateur.",
      },
    ],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();

  return {
    text,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
