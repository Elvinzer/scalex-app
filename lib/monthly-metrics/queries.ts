import { and, desc, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { closingKpiEntries, monthlyMetrics, salesCalls, settingKpiEntries } from "@/db/schema";

import { aggregateSalesCallsByMonth, type MonthlyCallSource } from "./call-source";
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
  settingManualOverride: boolean;
  closingManualOverride: boolean;
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
    acquisitionMetrics: row.acquisitionMetrics,
    cashCollectedSource: row.cashCollectedSource as StripeFieldSource,
    cashCollectedSyncedAt: row.cashCollectedSyncedAt,
    cashCollectedManualBackup: row.cashCollectedManualBackup,
    newCustomers: row.newCustomers,
    newCustomersSource: row.newCustomersSource as StripeFieldSource,
    newCustomersSyncedAt: row.newCustomersSyncedAt,
    settingManualOverride: row.settingManualOverride,
    closingManualOverride: row.closingManualOverride,
  };
}

export const getMonthlyMetrics = cache(async (
  userId: string,
  year: number,
  month: number
): Promise<MonthlyMetricsRow | null> => {
  const [row] = await db
    .select()
    .from(monthlyMetrics)
    .where(and(eq(monthlyMetrics.userId, userId), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)))
    .limit(1);

  return row ? toRow(row) : null;
});

export const getMonthlyMetricsForYear = cache(async (userId: string, year: number): Promise<MonthlyMetricsRow[]> => {
  const rows = await db
    .select()
    .from(monthlyMetrics)
    .where(and(eq(monthlyMetrics.userId, userId), eq(monthlyMetrics.year, year)));

  return rows.map(toRow);
});

// Small table, fetched whole — used by the Dashboard/Funnel merge resolver
// and the 8-month sparkline, which both span across year boundaries.
export const getAllMonthlyMetrics = cache(async (userId: string): Promise<MonthlyMetricsRow[]> => {
  const rows = await db.select().from(monthlyMetrics).where(eq(monthlyMetrics.userId, userId));
  return rows.map(toRow);
});

export const getSettingKpiEntries = cache(async (userId: string) => {
  return db
    .select()
    .from(settingKpiEntries)
    .where(eq(settingKpiEntries.userId, userId))
    .orderBy(desc(settingKpiEntries.date));
});

export const getClosingKpiEntries = cache(async (userId: string) => {
  return db
    .select()
    .from(closingKpiEntries)
    .where(eq(closingKpiEntries.userId, userId))
    .orderBy(desc(closingKpiEntries.date));
});

export const getSalesCallKpiRecords = cache(async (userId: string) => {
  return db
    .select({
      scheduledAt: salesCalls.scheduledAt,
      attendance: salesCalls.attendance,
      outcome: salesCalls.outcome,
    })
    .from(salesCalls)
    .where(eq(salesCalls.userId, userId));
});

export async function getMonthlyCallSources(userId: string): Promise<Record<string, MonthlyCallSource>> {
  const rows = await getSalesCallKpiRecords(userId);

  return aggregateSalesCallsByMonth(rows);
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
    settingManualOverride: false,
    closingManualOverride: false,
  };
}
