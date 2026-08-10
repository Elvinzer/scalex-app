import type { ResolvedPeriod } from "@/lib/period";
import { isInPeriod } from "@/lib/period";

export const STRIPE_INSIGHT_SNAPSHOT_VERSION = "v1" as const;

export type StripeTransactionStatus = "succeeded" | "pending" | "failed" | "partially_refunded" | "refunded";
export type StripePaymentType = "one_shot" | "subscription" | "unknown";
export type StripeRefundStatus = "succeeded" | "pending" | "failed" | "canceled";

export type StripeInsightTransaction = {
  id: string;
  stripeAccountId: string;
  amountCents: number;
  amountRefundedCents: number;
  currency: string;
  status: StripeTransactionStatus;
  paymentType: StripePaymentType;
  customerId: string | null;
  occurredAt: Date | string;
};

export type StripeInsightRefund = {
  id: string;
  stripeAccountId: string;
  stripeChargeId: string | null;
  amountCents: number;
  currency: string;
  status: StripeRefundStatus;
  occurredAt: Date | string;
};

export type StripeMetricComparison = {
  current: number;
  previous: number | null;
  delta: number | null;
  deltaPercent: number | null;
};

export type StripeInsightSnapshot = {
  version: typeof STRIPE_INSIGHT_SNAPSHOT_VERSION;
  period: {
    key: ResolvedPeriod["key"];
    start: string | null;
    end: string | null;
  };
  currency: string;
  grossCents: number;
  refundsCents: number;
  netCents: number;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  amountAtRiskCents: number;
  recurringRevenueCents: number;
  recurringSharePct: number | null;
  uniqueCustomers: number | null;
  customersWithKnownId: number;
  customersWithoutId: number;
  repeatCustomers: number | null;
  repeatCustomerRatePct: number | null;
  averageTicketCents: number | null;
  refundRatePct: number | null;
  failureRatePct: number | null;
  topCustomerSharePct: number | null;
  plannedAmountCents: number;
  comparison: {
    grossCents: StripeMetricComparison;
    refundsCents: StripeMetricComparison;
    netCents: StripeMetricComparison;
    successfulTransactions: StripeMetricComparison;
  };
};

export type StripeInsightSignalType =
  | "trend"
  | "refunds"
  | "failures"
  | "recurrence"
  | "loyalty"
  | "concentration"
  | "insufficient_data";

export type StripeInsightPriority = "high" | "medium" | "low";

export type StripeInsightSignal = {
  type: StripeInsightSignalType;
  priority: StripeInsightPriority;
  title: string;
  summary: string;
  evidence: string[];
  action: string;
  actionHref: string;
};

export type StripeTrendPoint = {
  key: string;
  label: string;
  grossCents: number;
  refundsCents: number;
  netCents: number;
  transactionCount: number;
};

const MIN_SIGNAL_SAMPLE = 5;
const TREND_THRESHOLD_PCT = 15;
const REFUND_THRESHOLD_PCT = 5;
const FAILURE_THRESHOLD_PCT = 10;
const RECURRING_THRESHOLD_PCT = 30;
const REPEAT_THRESHOLD_PCT = 25;
const CONCENTRATION_THRESHOLD_PCT = 50;

function asDate(value: Date | string): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizedCurrency(currency: string): string {
  return currency.trim().toLowerCase();
}

function isSuccessful(status: StripeTransactionStatus): boolean {
  return status === "succeeded" || status === "partially_refunded" || status === "refunded";
}

function isCountedRefund(status: StripeRefundStatus): boolean {
  return status === "succeeded";
}

function metricComparison(current: number, previous: number | null): StripeMetricComparison {
  if (previous === null) return { current, previous: null, delta: null, deltaPercent: null };
  const delta = current - previous;
  return {
    current,
    previous,
    delta,
    // A previous zero is explicit rather than an invented infinity. The UI
    // can render this as “Nouveau” or “—” without hiding the delta.
    deltaPercent: previous === 0 ? null : (delta / Math.abs(previous)) * 100,
  };
}

function aggregateForPeriod(
  transactions: StripeInsightTransaction[],
  refunds: StripeInsightRefund[],
  period: ResolvedPeriod,
  currency: string,
  plannedAmountCents: number,
): Omit<StripeInsightSnapshot, "version" | "period" | "currency" | "comparison"> {
  const selectedCurrency = normalizedCurrency(currency);
  const periodTransactions = transactions.filter((transaction) => {
    const occurredAt = asDate(transaction.occurredAt);
    return (
      normalizedCurrency(transaction.currency) === selectedCurrency &&
      occurredAt !== null &&
      isInPeriod(period, occurredAt)
    );
  });
  const periodRefunds = refunds.filter((refund) => {
    const occurredAt = asDate(refund.occurredAt);
    return (
      normalizedCurrency(refund.currency) === selectedCurrency &&
      isCountedRefund(refund.status) &&
      occurredAt !== null &&
      isInPeriod(period, occurredAt)
    );
  });

  const successful = periodTransactions.filter((transaction) => isSuccessful(transaction.status));
  const failed = periodTransactions.filter((transaction) => transaction.status === "failed");
  const pending = periodTransactions.filter((transaction) => transaction.status === "pending");
  const grossCents = successful.reduce((sum, transaction) => sum + Math.max(0, transaction.amountCents), 0);
  const refundsCents = periodRefunds.reduce((sum, refund) => sum + Math.max(0, refund.amountCents), 0);
  const netCents = grossCents - refundsCents;
  const recurringRevenueCents = successful
    .filter((transaction) => transaction.paymentType === "subscription")
    .reduce((sum, transaction) => sum + Math.max(0, transaction.amountCents), 0);
  const customerAmounts = new Map<string, number>();
  const customerTransactionCounts = new Map<string, number>();
  for (const transaction of successful) {
    if (!transaction.customerId) continue;
    customerAmounts.set(
      transaction.customerId,
      (customerAmounts.get(transaction.customerId) ?? 0) + Math.max(0, transaction.amountCents),
    );
    customerTransactionCounts.set(
      transaction.customerId,
      (customerTransactionCounts.get(transaction.customerId) ?? 0) + 1,
    );
  }
  const customersWithKnownId = customerAmounts.size;
  const customersWithoutId = successful.filter((transaction) => !transaction.customerId).length;
  const repeatCustomers = customersWithKnownId > 0
    ? [...customerTransactionCounts.values()].filter((count) => count >= 2).length
    : null;
  const uniqueCustomers = customersWithKnownId > 0 ? customersWithKnownId : null;
  const topCustomerCents = customersWithKnownId > 0 ? Math.max(...customerAmounts.values()) : null;
  const totalChargeCount = successful.length + failed.length;

  return {
    grossCents,
    refundsCents,
    netCents,
    successfulTransactions: successful.length,
    failedTransactions: failed.length,
    pendingTransactions: pending.length,
    amountAtRiskCents:
      failed.reduce((sum, transaction) => sum + Math.max(0, transaction.amountCents), 0) +
      Math.max(0, plannedAmountCents),
    recurringRevenueCents,
    recurringSharePct: grossCents > 0 ? (recurringRevenueCents / grossCents) * 100 : null,
    uniqueCustomers,
    customersWithKnownId,
    customersWithoutId,
    repeatCustomers,
    repeatCustomerRatePct:
      uniqueCustomers && uniqueCustomers > 0 && repeatCustomers !== null
        ? (repeatCustomers / uniqueCustomers) * 100
        : null,
    averageTicketCents: successful.length > 0 ? grossCents / successful.length : null,
    refundRatePct: grossCents > 0 ? (refundsCents / grossCents) * 100 : null,
    failureRatePct: totalChargeCount > 0 ? (failed.length / totalChargeCount) * 100 : null,
    topCustomerSharePct:
      grossCents > 0 && topCustomerCents !== null ? (topCustomerCents / grossCents) * 100 : null,
    plannedAmountCents: Math.max(0, plannedAmountCents),
  };
}

function previousPeriod(period: ResolvedPeriod): ResolvedPeriod {
  if (!period.start || !period.end) return { key: "all", start: null, end: null };
  const duration = period.end.getTime() - period.start.getTime();
  const end = new Date(period.start.getTime() - 1);
  return { key: period.key, start: new Date(end.getTime() - duration), end };
}

function dateValue(value: Date | string | null): string | null {
  const date = value ? asDate(value) : null;
  return date ? date.toISOString() : null;
}

export function buildStripeInsightSnapshot(
  transactions: StripeInsightTransaction[],
  refunds: StripeInsightRefund[],
  period: ResolvedPeriod,
  currency: string,
  plannedAmountCents = 0,
): StripeInsightSnapshot {
  const current = aggregateForPeriod(transactions, refunds, period, currency, plannedAmountCents);
  const previous = period.start && period.end
    ? aggregateForPeriod(transactions, refunds, previousPeriod(period), currency, 0)
    : null;

  return {
    version: STRIPE_INSIGHT_SNAPSHOT_VERSION,
    period: { key: period.key, start: dateValue(period.start), end: dateValue(period.end) },
    currency: normalizedCurrency(currency),
    ...current,
    comparison: {
      grossCents: metricComparison(current.grossCents, previous?.grossCents ?? null),
      refundsCents: metricComparison(current.refundsCents, previous?.refundsCents ?? null),
      netCents: metricComparison(current.netCents, previous?.netCents ?? null),
      successfulTransactions: metricComparison(
        current.successfulTransactions,
        previous?.successfulTransactions ?? null,
      ),
    },
  };
}

function formatPct(value: number | null, locale: string): string {
  if (value === null) return locale === "en" ? "Not enough data" : "Donnée insuffisante";
  return `${new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR", { maximumFractionDigits: 0 }).format(Math.round(value))} %`;
}

function formatAmount(cents: number, currency: string, locale: string): string {
  return `${new Intl.NumberFormat(locale === "en" ? "en-GB" : "fr-FR").format(Math.round(cents / 100))} ${currency.toUpperCase()}`;
}

function priorityForRate(value: number, highThreshold: number): StripeInsightPriority {
  return value >= highThreshold * 2 ? "high" : "medium";
}

export function buildStripeInsightSignals(snapshot: StripeInsightSnapshot, locale = "fr"): StripeInsightSignal[] {
  const isEnglish = locale === "en";
  const totalSample = snapshot.successfulTransactions + snapshot.failedTransactions;
  if (totalSample === 0) {
    return [
      {
        type: "insufficient_data",
        priority: "low",
        title: isEnglish ? "Not enough transactions yet" : "Pas encore assez de transactions",
        summary: isEnglish ? "Sync Stripe or widen the period to get a reliable signal." : "Synchronise Stripe ou élargis la période pour faire émerger un signal fiable.",
        evidence: [isEnglish ? "No transaction matches this currency and period." : "Aucune transaction dans la devise et la période sélectionnées."],
        action: isEnglish ? "Refresh data" : "Rafraîchir les données",
        actionHref: "#stripe-insights-toolbar",
      },
    ];
  }

  const signals: StripeInsightSignal[] = [];
  const trend = snapshot.comparison.grossCents;
  if (
    totalSample >= MIN_SIGNAL_SAMPLE &&
    trend.deltaPercent !== null &&
    Math.abs(trend.deltaPercent) >= TREND_THRESHOLD_PCT
  ) {
    const isDown = trend.deltaPercent < 0;
    signals.push({
      type: "trend",
      priority: isDown && trend.deltaPercent <= -20 ? "high" : "medium",
      title: isDown ? (isEnglish ? "Gross revenue is down" : "Le CA brut ralentit") : (isEnglish ? "Gross revenue is up" : "Le CA brut accélère"),
      summary: isDown
        ? (isEnglish ? "Payments are down from the previous period. Find the break before increasing traffic." : "Le rythme de paiement est inférieur à la période précédente : cherche le point de rupture avant d’augmenter le trafic.")
        : (isEnglish ? "Payments are up. Identify what changed so you can repeat it." : "Le rythme de paiement progresse : identifie ce qui a changé pour le rendre reproductible."),
      evidence: [
        `${isEnglish ? "Gross revenue" : "CA brut"} : ${formatAmount(trend.current, snapshot.currency, locale)}`,
        `${isEnglish ? "Change vs previous period" : "Écart période précédente"} : ${trend.deltaPercent >= 0 ? "+" : ""}${Math.round(trend.deltaPercent)} %`,
      ],
      action: isDown ? (isEnglish ? "Check the sales funnel" : "Vérifier le tunnel de vente") : (isEnglish ? "Identify what changed" : "Documenter le levier de croissance"),
      actionHref: "#stripe-trend",
    });
  }

  if (
    snapshot.successfulTransactions >= MIN_SIGNAL_SAMPLE &&
    snapshot.refundRatePct !== null &&
    snapshot.refundRatePct >= REFUND_THRESHOLD_PCT
  ) {
    signals.push({
      type: "refunds",
      priority: priorityForRate(snapshot.refundRatePct, REFUND_THRESHOLD_PCT),
      title: isEnglish ? "Refunds are reducing revenue" : "Les remboursements érodent le CA",
      summary: isEnglish ? "Refunds account for a meaningful share of gross revenue. Check the promise and delivery time." : "Une part notable du CA brut repart en remboursements : vérifie la promesse et le délai de livraison.",
      evidence: [
        `${isEnglish ? "Refund rate" : "Taux de remboursement"} : ${formatPct(snapshot.refundRatePct, locale)}`,
        `${isEnglish ? "Refunds" : "Remboursements"} : ${formatAmount(snapshot.refundsCents, snapshot.currency, locale)}`,
      ],
      action: isEnglish ? "Analyze refunded sales" : "Analyser les ventes remboursées",
      actionHref: "#stripe-transactions",
    });
  }

  if (
    totalSample >= MIN_SIGNAL_SAMPLE &&
    snapshot.failureRatePct !== null &&
    snapshot.failureRatePct >= FAILURE_THRESHOLD_PCT
  ) {
    signals.push({
      type: "failures",
      priority: priorityForRate(snapshot.failureRatePct, FAILURE_THRESHOLD_PCT),
      title: isEnglish ? "Failed payments need attention" : "Des paiements échouent encore",
      summary: isEnglish ? "Failed payments put revenue at risk. Follow up with those customers before acquiring more." : "Les échecs créent du CA à risque : relance les clients concernés avant d’acquérir davantage.",
      evidence: [
        `${isEnglish ? "Failure rate" : "Taux d’échec"} : ${formatPct(snapshot.failureRatePct, locale)}`,
        `${isEnglish ? "Amount at risk" : "Montant à risque"} : ${formatAmount(snapshot.amountAtRiskCents, snapshot.currency, locale)}`,
      ],
      action: isEnglish ? "Handle failed payments" : "Traiter les impayés",
      actionHref: "#failed-payments",
    });
  }

  if (
    snapshot.successfulTransactions >= MIN_SIGNAL_SAMPLE &&
    snapshot.recurringSharePct !== null &&
    snapshot.recurringSharePct >= RECURRING_THRESHOLD_PCT
  ) {
    signals.push({
      type: "recurrence",
      priority: "low",
      title: isEnglish ? "Recurring revenue is a large share" : "Le récurrent pèse dans le CA",
      summary: isEnglish ? "Subscriptions account for a large share of revenue. Protect retention before increasing volume." : "Une part significative du CA vient des abonnements : protège la rétention avant de pousser le volume.",
      evidence: [
        `${isEnglish ? "Recurring share" : "Part récurrente"} : ${formatPct(snapshot.recurringSharePct, locale)}`,
        `${isEnglish ? "Recurring revenue" : "CA récurrent"} : ${formatAmount(snapshot.recurringRevenueCents, snapshot.currency, locale)}`,
      ],
      action: isEnglish ? "Track retention" : "Suivre la rétention",
      actionHref: "#stripe-insights",
    });
  }

  if (
    snapshot.successfulTransactions >= MIN_SIGNAL_SAMPLE &&
    snapshot.repeatCustomerRatePct !== null &&
    snapshot.repeatCustomerRatePct >= REPEAT_THRESHOLD_PCT
  ) {
    signals.push({
      type: "loyalty",
      priority: "medium",
      title: isEnglish ? "Customers are buying again" : "Les clients reviennent",
      summary: isEnglish ? "Repeat purchases are an available lever. Plan the next offer after purchase." : "La récurrence client est un levier exploitable : formalise la prochaine offre après achat.",
      evidence: [
        `${isEnglish ? "Repeat customers" : "Clients récurrents"} : ${snapshot.repeatCustomers ?? 0}`,
        `${isEnglish ? "Repeat-customer rate" : "Taux de clients récurrents"} : ${formatPct(snapshot.repeatCustomerRatePct, locale)}`,
      ],
      action: isEnglish ? "Prepare the next offer" : "Préparer la prochaine offre",
      actionHref: "#stripe-transactions",
    });
  }

  if (
    snapshot.successfulTransactions >= MIN_SIGNAL_SAMPLE &&
    snapshot.topCustomerSharePct !== null &&
    snapshot.topCustomerSharePct >= CONCENTRATION_THRESHOLD_PCT
  ) {
    signals.push({
      type: "concentration",
      priority: "high",
      title: isEnglish ? "Revenue depends on one customer" : "Le CA est concentré",
      summary: isEnglish ? "One known customer accounts for a large share of revenue. Protect the relationship and diversify acquisition." : "Un client connu représente une part importante du CA : sécurise cette relation et diversifie l’acquisition.",
      evidence: [
        `${isEnglish ? "Largest known customer share" : "Part du plus gros client connu"} : ${formatPct(snapshot.topCustomerSharePct, locale)}`,
        `${isEnglish ? "Known customers" : "Clients connus"} : ${snapshot.customersWithKnownId}`,
      ],
      action: isEnglish ? "Reduce customer dependency" : "Réduire la dépendance client",
      actionHref: "#stripe-transactions",
    });
  }

  if (signals.length === 0) {
    signals.push({
      type: "insufficient_data",
      priority: "low",
      title: isEnglish ? "No clear signal yet" : "Aucun signal critique détecté",
      summary: isEnglish ? "Indicators are stable for this period. Keep tracking the trend." : "Les indicateurs sont dans une zone stable pour cette période ; continue à suivre la tendance.",
      evidence: [
        isEnglish
          ? `${totalSample} transaction${totalSample > 1 ? "s" : ""} analyzed`
          : `${totalSample} transaction${totalSample > 1 ? "s" : ""} analysée${totalSample > 1 ? "s" : ""}`,
        `${isEnglish ? "Refund rate" : "Taux de remboursement"} : ${formatPct(snapshot.refundRatePct, locale)}`,
      ],
      action: isEnglish ? "View transactions" : "Voir les transactions",
      actionHref: "#stripe-transactions",
    });
  }

  return signals;
}

function monthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "fr-FR", { month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

export function buildStripeTrend(
  transactions: StripeInsightTransaction[],
  refunds: StripeInsightRefund[],
  period: ResolvedPeriod,
  currency: string,
  locale = "fr",
): StripeTrendPoint[] {
  const selectedCurrency = normalizedCurrency(currency);
  const dates = [
    ...transactions
      .filter((transaction) => normalizedCurrency(transaction.currency) === selectedCurrency)
      .map((transaction) => asDate(transaction.occurredAt)),
    ...refunds
      .filter((refund) => normalizedCurrency(refund.currency) === selectedCurrency)
      .map((refund) => asDate(refund.occurredAt)),
  ].filter((date): date is Date => date !== null && isInPeriod(period, date));
  if (dates.length === 0) return [];

  let cursor = monthStart(period.start ?? new Date(Math.min(...dates.map((date) => date.getTime()))));
  const last = monthStart(period.end ?? new Date(Math.max(...dates.map((date) => date.getTime()))));
  const buckets = new Map<string, StripeTrendPoint>();
  while (cursor <= last) {
    buckets.set(monthKey(cursor), {
      key: monthKey(cursor),
      label: monthLabel(cursor, locale),
      grossCents: 0,
      refundsCents: 0,
      netCents: 0,
      transactionCount: 0,
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  for (const transaction of transactions) {
    const occurredAt = asDate(transaction.occurredAt);
    if (
      !occurredAt ||
      normalizedCurrency(transaction.currency) !== selectedCurrency ||
      !isInPeriod(period, occurredAt) ||
      !isSuccessful(transaction.status)
    ) {
      continue;
    }
    const bucket = buckets.get(monthKey(occurredAt));
    if (!bucket) continue;
    bucket.grossCents += Math.max(0, transaction.amountCents);
    bucket.transactionCount += 1;
  }
  for (const refund of refunds) {
    const occurredAt = asDate(refund.occurredAt);
    if (
      !occurredAt ||
      normalizedCurrency(refund.currency) !== selectedCurrency ||
      !isInPeriod(period, occurredAt) ||
      !isCountedRefund(refund.status)
    ) {
      continue;
    }
    const bucket = buckets.get(monthKey(occurredAt));
    if (bucket) bucket.refundsCents += Math.max(0, refund.amountCents);
  }
  return [...buckets.values()].map((bucket) => ({ ...bucket, netCents: bucket.grossCents - bucket.refundsCents }));
}

export function listStripeCurrencies(
  transactions: StripeInsightTransaction[],
  refunds: StripeInsightRefund[],
): string[] {
  const currencyCounts = new Map<string, number>();
  for (const transaction of transactions) {
    const currency = normalizedCurrency(transaction.currency);
    currencyCounts.set(currency, (currencyCounts.get(currency) ?? 0) + 1);
  }
  for (const refund of refunds) {
    const currency = normalizedCurrency(refund.currency);
    currencyCounts.set(currency, (currencyCounts.get(currency) ?? 0) + 1);
  }
  return [...currencyCounts.keys()].sort((a, b) => {
    const countDelta = (currencyCounts.get(b) ?? 0) - (currencyCounts.get(a) ?? 0);
    return countDelta === 0 ? a.localeCompare(b) : countDelta;
  });
}
