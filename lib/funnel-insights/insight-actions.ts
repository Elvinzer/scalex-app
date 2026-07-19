"use server";

import Anthropic from "@anthropic-ai/sdk";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { closingKpiEntries, funnelStageInsights, settingKpiEntries, users } from "@/db/schema";
import { resolveAgentKey } from "@/lib/agent/client";
import { generateStageInsight } from "@/lib/agent/insight";
import { STAGE_KNOWLEDGE, type FunnelStageKey } from "@/lib/agent/knowledge";
import { aggregateClosingEntries, computeClosingRates } from "@/lib/closing/metrics";
import { aggregateEntries, computeFunnelRates } from "@/lib/setting/funnel";
import { createClient } from "@/lib/supabase/server";

const stageSchema = z.enum([
  "outreachRate",
  "responseRate",
  "proposalRate",
  "bookingRate",
  "showUpRate",
  "closingRate",
]);

const SETTING_STAGES = ["outreachRate", "responseRate", "proposalRate", "bookingRate"] as const;
type SettingStageKey = (typeof SETTING_STAGES)[number];

function isSettingStage(stage: FunnelStageKey): stage is SettingStageKey {
  return (SETTING_STAGES as readonly string[]).includes(stage);
}

async function requireUserId(): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    throw new Error("Session expirée, reconnecte-toi.");
  }
  return data.claims.sub as string;
}

// Every answer must match a known question id + option id for that stage —
// never forwards arbitrary client text into the prompt sent to the model.
function validateAnswers(stage: FunnelStageKey, rawAnswers: unknown): Record<string, string> | null {
  if (typeof rawAnswers !== "object" || rawAnswers === null) return null;
  const knowledge = STAGE_KNOWLEDGE[stage];
  const validated: Record<string, string> = {};

  for (const question of knowledge.questions) {
    const value = (rawAnswers as Record<string, unknown>)[question.id];
    if (typeof value !== "string") return null;
    if (!question.options.some((option) => option.id === value)) return null;
    validated[question.id] = value;
  }

  return validated;
}

export async function generateFunnelStageInsight(
  stageInput: string,
  rawAnswers: unknown
): Promise<{ insightText: string | null; error: string | null }> {
  const parsedStage = stageSchema.safeParse(stageInput);
  if (!parsedStage.success) {
    return { insightText: null, error: "Étape invalide" };
  }
  const stage = parsedStage.data;

  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return { insightText: null, error: error instanceof Error ? error.message : "Session expirée" };
  }

  const answers = validateAnswers(stage, rawAnswers);
  if (!answers) {
    return { insightText: null, error: "Réponses invalides" };
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return { insightText: null, error: "Utilisateur introuvable" };
  }

  // Recompute the real rate server-side — never trust a client-sent number.
  const [settingEntries, closingEntries] = await Promise.all([
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, userId)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, userId)),
  ]);
  const settingTotals = aggregateEntries(settingEntries);
  const settingRates = computeFunnelRates(settingTotals);
  const closingTotals = aggregateClosingEntries(closingEntries);
  const closingRates = computeClosingRates(closingTotals, settingTotals.callsBooked);

  const rate = isSettingStage(stage) ? settingRates[stage] : closingRates[stage];
  if (rate === null) {
    return { insightText: null, error: "Pas assez de données pour calculer ce taux." };
  }

  let agentKey;
  try {
    agentKey = await resolveAgentKey(user);
  } catch (error) {
    return {
      insightText: null,
      error: error instanceof Error ? error.message : "Clé Anthropic indisponible",
    };
  }

  let result;
  try {
    result = await generateStageInsight({
      stage,
      ratePercent: Math.round(rate * 100),
      answers,
      apiKey: agentKey.apiKey,
    });
  } catch (error) {
    // Only a confirmed 401 on the user's own key means the key is dead —
    // never flag the shared key, and never treat rate limits/network blips
    // as an invalid key.
    if (agentKey.source === "byok" && error instanceof Anthropic.AuthenticationError) {
      await db.update(users).set({ anthropicApiKeyInvalid: true }).where(eq(users.id, userId));
      revalidatePath("/settings");
      return {
        insightText: null,
        error:
          "Ta clé Anthropic ne fonctionne plus (révoquée ou expirée). Ajoute une nouvelle clé dans Réglages pour continuer.",
      };
    }
    return { insightText: null, error: "La génération de l'insight a échoué, réessaie." };
  }

  await db.insert(funnelStageInsights).values({
    userId,
    stage,
    answers,
    insightText: result.text,
    keySource: agentKey.source,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  revalidatePath("/funnel");
  revalidatePath("/acquisition/setting");
  revalidatePath("/ventes/closing");
  revalidatePath("/funnel/insights");
  return { insightText: result.text, error: null };
}

const implementedInputSchema = z.object({
  insightId: z.string().uuid(),
  implemented: z.boolean(),
});

export async function setInsightImplemented(
  insightId: string,
  implemented: boolean
): Promise<{ error: string | null }> {
  const parsed = implementedInputSchema.safeParse({ insightId, implemented });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Entrée invalide" };
  }

  let userId: string;
  try {
    userId = await requireUserId();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Session expirée" };
  }

  const updated = await db
    .update(funnelStageInsights)
    .set({ implemented: parsed.data.implemented, implementedAt: new Date() })
    .where(
      and(eq(funnelStageInsights.id, parsed.data.insightId), eq(funnelStageInsights.userId, userId))
    )
    .returning({ id: funnelStageInsights.id });

  if (updated.length === 0) {
    return { error: "Insight introuvable" };
  }

  revalidatePath("/funnel/insights");
  return { error: null };
}
