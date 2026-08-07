import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { stripeInsightRuns, stripeTransactionRefunds, stripeTransactions } from "@/db/schema";
import { isInPeriod, type ResolvedPeriod } from "@/lib/period";

import {
  buildStripeInsightSignals,
  buildStripeInsightSnapshot,
  buildStripeTrend,
  listStripeCurrencies,
  type StripeInsightRefund,
  type StripeInsightSignal,
  type StripeInsightSnapshot,
  type StripeInsightTransaction,
  type StripeTrendPoint,
} from "./transaction-insights";

const transactionStatusSchema = z.enum(["succeeded", "pending", "failed", "partially_refunded", "refunded"]);
const paymentTypeSchema = z.enum(["one_shot", "subscription", "unknown"]);
const refundStatusSchema = z.enum(["succeeded", "pending", "failed", "canceled"]);

function toInsightTransaction(row: typeof stripeTransactions.$inferSelect): StripeInsightTransaction | null {
  const status = transactionStatusSchema.safeParse(row.status);
  const paymentType = paymentTypeSchema.safeParse(row.paymentType);
  if (!status.success || !paymentType.success) return null;
  return {
    id: row.stripeChargeId,
    stripeAccountId: row.stripeAccountId,
    amountCents: row.amountCents,
    amountRefundedCents: row.amountRefundedCents,
    currency: row.currency,
    status: status.data,
    paymentType: paymentType.data,
    customerId: row.customerId,
    occurredAt: row.occurredAt,
  };
}

function toInsightRefund(row: typeof stripeTransactionRefunds.$inferSelect): StripeInsightRefund | null {
  const status = refundStatusSchema.safeParse(row.status);
  if (!status.success) return null;
  return {
    id: row.stripeRefundId,
    stripeAccountId: row.stripeAccountId,
    stripeChargeId: row.stripeChargeId,
    amountCents: row.amountCents,
    currency: row.currency,
    status: status.data,
    occurredAt: row.occurredAt,
  };
}

export type StripeInsightData = {
  transactions: StripeInsightTransaction[];
  refunds: StripeInsightRefund[];
  visibleTransactions: StripeInsightTransaction[];
  availableCurrencies: string[];
  activeCurrency: string | null;
  snapshot: StripeInsightSnapshot | null;
  signals: StripeInsightSignal[];
  trend: StripeTrendPoint[];
};

export type StripeInsightRunPreview = {
  insightText: string;
  currency: string;
  focusSignalType: string | null;
  createdAt: Date;
};

export async function getLatestStripeInsightRun(
  accountId: string,
  currency: string,
  period: ResolvedPeriod,
): Promise<StripeInsightRunPreview | null> {
  const periodStart = period.start?.toISOString().slice(0, 10) ?? null;
  const periodEnd = period.end?.toISOString().slice(0, 10) ?? null;
  const where = and(
    eq(stripeInsightRuns.userId, accountId),
    eq(stripeInsightRuns.currency, currency),
    periodStart ? eq(stripeInsightRuns.periodStart, periodStart) : isNull(stripeInsightRuns.periodStart),
    periodEnd ? eq(stripeInsightRuns.periodEnd, periodEnd) : isNull(stripeInsightRuns.periodEnd),
  );
  const [row] = await db
    .select({
      insightText: stripeInsightRuns.insightText,
      currency: stripeInsightRuns.currency,
      focusSignalType: stripeInsightRuns.focusSignalType,
      createdAt: stripeInsightRuns.createdAt,
    })
    .from(stripeInsightRuns)
    .where(where)
    .orderBy(desc(stripeInsightRuns.createdAt))
    .limit(1);
  return row ?? null;
}

export async function getStripeInsightData(
  accountId: string,
  stripeAccountId: string,
  period: ResolvedPeriod,
  requestedCurrency: string | null | undefined,
  plannedAmountCents = 0,
): Promise<StripeInsightData> {
  const [transactionRows, refundRows] = await Promise.all([
    db
      .select()
      .from(stripeTransactions)
      .where(and(eq(stripeTransactions.userId, accountId), eq(stripeTransactions.stripeAccountId, stripeAccountId)))
      .orderBy(desc(stripeTransactions.occurredAt)),
    db
      .select()
      .from(stripeTransactionRefunds)
      .where(and(eq(stripeTransactionRefunds.userId, accountId), eq(stripeTransactionRefunds.stripeAccountId, stripeAccountId)))
      .orderBy(desc(stripeTransactionRefunds.occurredAt)),
  ]);

  const transactions = transactionRows.flatMap((row) => {
    const transaction = toInsightTransaction(row);
    return transaction ? [transaction] : [];
  });
  const refunds = refundRows.flatMap((row) => {
    const refund = toInsightRefund(row);
    return refund ? [refund] : [];
  });
  const availableCurrencies = listStripeCurrencies(transactions, refunds);
  const normalizedRequested = requestedCurrency?.trim().toLowerCase() ?? null;
  const activeCurrency = normalizedRequested && availableCurrencies.includes(normalizedRequested)
    ? normalizedRequested
    : availableCurrencies[0] ?? null;
  const visibleTransactions = activeCurrency
    ? transactions.filter((transaction) => {
        const occurredAt = transaction.occurredAt instanceof Date
          ? transaction.occurredAt
          : new Date(transaction.occurredAt);
        return (
          transaction.currency.toLowerCase() === activeCurrency &&
          !Number.isNaN(occurredAt.getTime()) &&
          isInPeriod(period, occurredAt)
        );
      })
    : [];

  if (!activeCurrency) {
    return {
      transactions,
      refunds,
      visibleTransactions,
      availableCurrencies,
      activeCurrency: null,
      snapshot: null,
      signals: [],
      trend: [],
    };
  }

  const snapshot = buildStripeInsightSnapshot(
    transactions,
    refunds,
    period,
    activeCurrency,
    plannedAmountCents,
  );
  return {
    transactions,
    refunds,
    visibleTransactions,
    availableCurrencies,
    activeCurrency,
    snapshot,
    signals: buildStripeInsightSignals(snapshot),
    trend: buildStripeTrend(transactions, refunds, period, activeCurrency),
  };
}
