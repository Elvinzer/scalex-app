"use server";

import Anthropic from "@anthropic-ai/sdk";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { stripeConnections, stripeInsightRuns, users } from "@/db/schema";
import { resolveAgentKey } from "@/lib/agent/client";
import { generateStripeInsight } from "@/lib/agent/stripe-insight";
import { requireUserIdOrError } from "@/lib/current-user";
import { inngest, stripeSyncRequested } from "@/lib/inngest/client";
import { isRateLimited } from "@/lib/rate-limit";
import { dateFromDayString, isInPeriod, resolvePeriod } from "@/lib/period";
import { summarize } from "@/lib/sales/installments";
import { getSales } from "@/lib/sales/queries";
import { getStripeInsightData } from "@/lib/stripe/insight-queries";
import { requirePermission } from "@/lib/team/context";

const refreshInputSchema = z.object({});
const generateInputSchema = z.object({
  period: z.enum(["this_month", "last_month", "last_30d", "last_90d", "this_year", "all"]),
  currency: z.string().trim().regex(/^[a-zA-Z]{3,10}$/),
  signalType: z.enum(["trend", "refunds", "failures", "recurrence", "loyalty", "concentration", "insufficient_data"]),
});

export async function requestStripeInsightsRefresh(): Promise<{ error: string | null }> {
  const userId = await requireUserIdOrError();
  if (typeof userId !== "string") return userId;

  const access = await requirePermission(userId, "ventes:suivi");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const parsed = refreshInputSchema.safeParse({});
  if (!parsed.success) return { error: "Demande invalide." };

  if (isRateLimited(`stripe-insights-refresh:${access.accountId}`, 2, 60_000)) {
    return { error: "Un rafraîchissement est déjà demandé. Réessaie dans une minute." };
  }

  const [connection] = await db
    .select({ id: stripeConnections.id })
    .from(stripeConnections)
    .where(eq(stripeConnections.userId, access.accountId))
    .limit(1);
  if (!connection) return { error: "Connecte Stripe pour rafraîchir les transactions." };

  await db
    .update(stripeConnections)
    .set({ initialSyncStatus: "pending", lastSyncError: null })
    .where(eq(stripeConnections.userId, access.accountId));

  try {
    await inngest.send(stripeSyncRequested.create({ userId: access.accountId }));
  } catch {
    await db
      .update(stripeConnections)
      .set({
        initialSyncStatus: "failed",
        lastSyncError: "La demande de synchronisation n'a pas pu être envoyée. Réessaie plus tard.",
      })
      .where(eq(stripeConnections.userId, access.accountId));
    return { error: "La synchronisation n'a pas pu être démarrée. Réessaie plus tard." };
  }

  revalidatePath("/ventes/suivi");
  return { error: null };
}

function snapshotJson(snapshot: NonNullable<Awaited<ReturnType<typeof getStripeInsightData>>["snapshot"]>): Record<string, unknown> {
  return {
    version: snapshot.version,
    period: snapshot.period,
    currency: snapshot.currency,
    grossCents: snapshot.grossCents,
    refundsCents: snapshot.refundsCents,
    netCents: snapshot.netCents,
    successfulTransactions: snapshot.successfulTransactions,
    failedTransactions: snapshot.failedTransactions,
    pendingTransactions: snapshot.pendingTransactions,
    amountAtRiskCents: snapshot.amountAtRiskCents,
    recurringRevenueCents: snapshot.recurringRevenueCents,
    recurringSharePct: snapshot.recurringSharePct,
    uniqueCustomers: snapshot.uniqueCustomers,
    customersWithKnownId: snapshot.customersWithKnownId,
    customersWithoutId: snapshot.customersWithoutId,
    repeatCustomers: snapshot.repeatCustomers,
    repeatCustomerRatePct: snapshot.repeatCustomerRatePct,
    averageTicketCents: snapshot.averageTicketCents,
    refundRatePct: snapshot.refundRatePct,
    failureRatePct: snapshot.failureRatePct,
    topCustomerSharePct: snapshot.topCustomerSharePct,
    plannedAmountCents: snapshot.plannedAmountCents,
    comparison: snapshot.comparison,
  };
}

function signalsJson(signals: Awaited<ReturnType<typeof getStripeInsightData>>["signals"]): Record<string, unknown>[] {
  return signals.map((signal) => ({
    type: signal.type,
    priority: signal.priority,
    title: signal.title,
    summary: signal.summary,
    evidence: signal.evidence,
    action: signal.action,
    actionHref: signal.actionHref,
  }));
}

export async function generateStripeTransactionInsight(
  rawInput: unknown,
): Promise<{ insightText: string | null; error: string | null }> {
  const parsed = generateInputSchema.safeParse(rawInput);
  if (!parsed.success) return { insightText: null, error: "Paramètres d'insight invalides." };

  const userId = await requireUserIdOrError();
  if (typeof userId !== "string") return { insightText: null, error: userId.error };
  const access = await requirePermission(userId, "ventes:suivi");
  if (!access) return { insightText: null, error: "Tu n'as pas accès à cette section." };
  const accountId = access.accountId;

  if (isRateLimited(`stripe-insights-ai:${accountId}`, 5, 60_000)) {
    return { insightText: null, error: "Trop de générations rapprochées. Réessaie dans une minute." };
  }

  const [connection] = await db
    .select({ stripeAccountId: stripeConnections.stripeAccountId })
    .from(stripeConnections)
    .where(eq(stripeConnections.userId, accountId))
    .limit(1);
  if (!connection) return { insightText: null, error: "Connecte Stripe pour générer un insight." };

  const period = resolvePeriod(parsed.data.period);
  const plannedAmountCents = parsed.data.currency.toLowerCase() === "eur"
    ? (await getSales(accountId))
        .filter((sale) => !sale.isOrphan && isInPeriod(period, dateFromDayString(sale.saleDate)))
        .reduce((sum, sale) => sum + summarize(sale.totalPrice, sale.installments).pendingTotal * 100, 0)
    : 0;
  const data = await getStripeInsightData(
    accountId,
    connection.stripeAccountId,
    period,
    parsed.data.currency,
    plannedAmountCents,
  );
  if (!data.snapshot || !data.activeCurrency) {
    return { insightText: null, error: "Pas encore assez de transactions pour générer un insight." };
  }
  if (data.activeCurrency !== parsed.data.currency.toLowerCase()) {
    return { insightText: null, error: "Cette devise n'est pas disponible pour la période sélectionnée." };
  }
  const signal = data.signals.find((candidate) => candidate.type === parsed.data.signalType);
  if (!signal) return { insightText: null, error: "Signal introuvable pour cette période." };

  const [user] = await db
    .select({ id: users.id, anthropicApiKeyEncrypted: users.anthropicApiKeyEncrypted })
    .from(users)
    .where(eq(users.id, accountId))
    .limit(1);
  if (!user) return { insightText: null, error: "Compte introuvable." };

  let agentKey;
  try {
    agentKey = await resolveAgentKey(user);
  } catch (error) {
    return {
      insightText: null,
      error: error instanceof Error ? error.message : "Clé Anthropic indisponible.",
    };
  }

  let result;
  try {
    result = await generateStripeInsight({ snapshot: data.snapshot, signal, apiKey: agentKey.apiKey });
  } catch (error) {
    if (agentKey.source === "byok" && error instanceof Anthropic.AuthenticationError) {
      await db.update(users).set({ anthropicApiKeyInvalid: true }).where(eq(users.id, accountId));
      revalidatePath("/settings");
      return {
        insightText: null,
        error: "Ta clé Anthropic ne fonctionne plus. Ajoute une nouvelle clé dans Réglages.",
      };
    }
    return { insightText: null, error: "La génération de l'insight a échoué, réessaie." };
  }

  await db.insert(stripeInsightRuns).values({
    userId: accountId,
    snapshotVersion: data.snapshot.version,
    periodStart: data.snapshot.period.start?.slice(0, 10) ?? null,
    periodEnd: data.snapshot.period.end?.slice(0, 10) ?? null,
    currency: data.snapshot.currency,
    focusSignalType: signal.type,
    snapshot: snapshotJson(data.snapshot),
    signals: signalsJson(data.signals),
    insightText: result.text,
    keySource: agentKey.source,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  revalidatePath("/ventes/suivi");
  return { insightText: result.text, error: null };
}
