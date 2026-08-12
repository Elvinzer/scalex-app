import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { falcoLanguageInstruction } from "./language-instruction";
import type { StripeInsightSignal, StripeInsightSnapshot } from "@/lib/stripe/transaction-insights";

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 420;

const SYSTEM_PROMPT =
  "Tu es l'agent Scale X, un coach opérationnel pour infopreneurs US. " +
  "Tu reformules un signal Stripe déterministe en français, en tutoyant l'utilisateur. " +
  "Écris 3 à 4 phrases maximum : constat chiffré, interprétation prudente, puis une action immédiate. " +
  "Utilise uniquement les chiffres et preuves fournis. N'invente jamais de cause, de client, de devise " +
  "ou de recommandation fondée sur une donnée absente. Ne demande jamais de clé API et ne mentionne pas " +
  "les détails techniques du traitement.";

function systemPromptFor(locale: Locale): string {
  return `${SYSTEM_PROMPT}\n\n${falcoLanguageInstruction(locale)}`;
}

const insightTextSchema = z.string().trim().min(1).max(4_000);

export type GenerateStripeInsightInput = {
  snapshot: StripeInsightSnapshot;
  signal: StripeInsightSignal;
  apiKey: string;
  locale?: Locale;
};

export type GenerateStripeInsightResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
};

export class EmptyStripeInsightError extends Error {
  constructor() {
    super("La génération n'a pas produit de texte exploitable.");
    this.name = "EmptyStripeInsightError";
  }
}

export async function generateStripeInsight({
  snapshot,
  signal,
  apiKey,
  locale,
}: GenerateStripeInsightInput): Promise<GenerateStripeInsightResult> {
  const client = new Anthropic({ apiKey });
  const validatedContext = {
    signal: {
      type: signal.type,
      priority: signal.priority,
      title: signal.title,
      summary: signal.summary,
      evidence: signal.evidence,
      action: signal.action,
    },
    snapshot: {
      version: snapshot.version,
      period: snapshot.period,
      currency: snapshot.currency,
      grossCents: snapshot.grossCents,
      refundsCents: snapshot.refundsCents,
      netCents: snapshot.netCents,
      successfulTransactions: snapshot.successfulTransactions,
      failedTransactions: snapshot.failedTransactions,
      amountAtRiskCents: snapshot.amountAtRiskCents,
      recurringSharePct: snapshot.recurringSharePct,
      repeatCustomerRatePct: snapshot.repeatCustomerRatePct,
      comparison: snapshot.comparison,
    },
  };

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPromptFor(locale ?? DEFAULT_LOCALE),
    messages: [
      {
        role: "user",
        content:
          "Voici le contexte validé par Scale X, sous forme de données agrégées.\n" +
          JSON.stringify(validatedContext) +
          "\n\nReformule le signal en insight directement lisible par l'utilisateur.",
      },
    ],
  });

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n");
  const parsedText = insightTextSchema.safeParse(text);
  if (!parsedText.success) throw new EmptyStripeInsightError();

  return {
    text: parsedText.data,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}
