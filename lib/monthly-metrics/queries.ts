import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { monthlyMetrics } from "@/db/schema";

import { EMPTY_MONTHLY_METRICS, type MonthlyMetricsInput } from "./types";

// "stripe"/"stripe_stale"/null — read-only, never part of MonthlyMetricsInput
// (the manual save path, saveMonthlyMetrics, must never be able to set
// these; only lib/stripe/sync-write.ts and disconnectStripe write them).
export type StripeFieldSource = "stripe" | "stripe_stale" | null;

export type MonthlyMetricsRow = MonthlyMetricsInput & {
  year: number;
  month: number;
  cashCollectedSource: StripeFieldSource;
  cashCollectedSyncedAt: Date | null;
  cashCollectedManualBackup: number | null;
  // Stripe-only "nouveaux clients" (paying customers) — distinct from
  // newFollowers (top-of-funnel leads/subscribers), no manual backup since
  // no manual entry point for this ever existed.
  newCustomers: number | null;
  newCustomersSource: StripeFieldSource;
  newCustomersSyncedAt: Date | null;
};

function toRow(row: typeof monthlyMetrics.$inferSelect): MonthlyMetricsRow {
  return {
    year: row.year,
    month: row.month,
    cashCollected: row.cashCollected,
    cashContracted: row.cashContracted,
    newFollowers: row.newFollowers,
    firstMessages: row.firstMessages,
    conversations: row.conversations,
    callsProposed: row.callsProposed,
    callsBooked: row.callsBooked,
    callsTaken: row.callsTaken,
    salesClosed: row.salesClosed,
    cashCollectedSource: row.cashCollectedSource as StripeFieldSource,
    cashCollectedSyncedAt: row.cashCollectedSyncedAt,
    cashCollectedManualBackup: row.cashCollectedManualBackup,
    newCustomers: row.newCustomers,
    newCustomersSource: row.newCustomersSource as StripeFieldSource,
    newCustomersSyncedAt: row.newCustomersSyncedAt,
  };
}

export async function getMonthlyMetrics(
  userId: string,
  year: number,
  month: number
): Promise<MonthlyMetricsRow | null> {
  const [row] = await db
    .select()
    .from(monthlyMetrics)
    .where(and(eq(monthlyMetrics.userId, userId), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)))
    .limit(1);

  return row ? toRow(row) : null;
}

export async function getMonthlyMetricsForYear(userId: string, year: number): Promise<MonthlyMetricsRow[]> {
  const rows = await db
    .select()
    .from(monthlyMetrics)
    .where(and(eq(monthlyMetrics.userId, userId), eq(monthlyMetrics.year, year)));

  return rows.map(toRow);
}

// Small table, fetched whole — used by the Dashboard/Funnel merge resolver
// and the 8-month sparkline, which both span across year boundaries.
export async function getAllMonthlyMetrics(userId: string): Promise<MonthlyMetricsRow[]> {
  const rows = await db.select().from(monthlyMetrics).where(eq(monthlyMetrics.userId, userId));
  return rows.map(toRow);
}

export function emptyMonthRow(year: number, month: number): MonthlyMetricsRow {
  return {
    ...EMPTY_MONTHLY_METRICS,
    year,
    month,
    cashCollectedSource: null,
    cashCollectedSyncedAt: null,
    cashCollectedManualBackup: null,
    newCustomers: null,
    newCustomersSource: null,
    newCustomersSyncedAt: null,
  };
}
