import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { lastCompletedMonths, type MonthWindow } from "@/lib/diagnostic/completed-months";
import { buildRates } from "@/lib/diagnostic/cascade";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import type { MetricKey } from "@/lib/diagnostic/metric-keys";

import type { BaselineSnapshot, MeasurementSnapshot } from "./types";
import type { InsightSnapshot } from "./types";
import { compareBaselineSnapshots } from "./measurement";

export const SUPPORTED_RATE_METRICS = ["responseRate", "proposalRate", "bookingRate", "showUpRate", "closingRate"] as const;
export type SupportedRateMetric = (typeof SUPPORTED_RATE_METRICS)[number];

export const MEASUREMENT_MONTHS = 3;
export const MIN_MEASUREMENT_SAMPLE = 10;

function isSupportedRateMetric(value: string | null | undefined): value is SupportedRateMetric {
  return value !== null && value !== undefined && (SUPPORTED_RATE_METRICS as readonly string[]).includes(value);
}

function volumeFor(metricKey: SupportedRateMetric, settingTotals: { firstMessagesSent: number; conversationsStarted: number; callsProposed: number; callsBooked: number }, closingTotals: { callsAttended: number }): number {
  switch (metricKey) {
    case "responseRate":
      return settingTotals.firstMessagesSent;
    case "proposalRate":
      return settingTotals.conversationsStarted;
    case "bookingRate":
      return settingTotals.callsProposed;
    case "showUpRate":
      return settingTotals.callsBooked;
    case "closingRate":
      return closingTotals.callsAttended;
  }
}

function periodForMonths(months: MonthWindow[]): { start: string; end: string } | null {
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return null;
  return { start: first.range.from, end: last.range.to };
}

function rateValue(metricKey: SupportedRateMetric, rates: Record<MetricKey, number | null>): number | null {
  return rates[metricKey] ?? null;
}

type KpiData = Awaited<ReturnType<typeof getDiagnosticKpiRawData>>;

async function loadKpiData(accountId: string): Promise<KpiData> {
  return getDiagnosticKpiRawData(accountId);
}

export async function calculateRateSnapshot(accountId: string, metricKey: string, months = lastCompletedMonths(MEASUREMENT_MONTHS)): Promise<BaselineSnapshot | null> {
  if (!isSupportedRateMetric(metricKey)) return null;
  const period = periodForMonths(months);
  if (!period) return null;
  const data = await loadKpiData(accountId);
  const { allSettingEntries, allClosingEntries, allMonthlyRows } = data;
  const [user] = await db.select({ sector: users.sector }).from(users).where(eq(users.id, accountId)).limit(1);
  const benchmarks = await getDiagnosticBenchmarks(user?.sector ?? null);
  const totals = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
    callSourcesByMonth: data.allCallSourcesByMonth,
    allSales: data.allSales,
    allLeads: data.allLeads,
    allLeadStageHistory: data.allLeadStageHistory,
    allEmailCampaigns: data.allEmailCampaigns,
    allMetaMetrics: data.allMetaMetrics,
    allNativeBookingLeads: data.allNativeBookingLeads,
  });
  const value = rateValue(metricKey, buildRates(totals.settingTotals, totals.closingTotals));
  const sampleSize = volumeFor(metricKey, totals.settingTotals, totals.closingTotals);
  if (value === null || sampleSize <= 0) return null;

  return {
    metricKey,
    unit: "fraction",
    value,
    periodStart: period.start,
    periodEnd: period.end,
    sampleSize,
    source: "diagnostic_kpi",
    freshness: new Date().toISOString(),
    benchmarkValue: benchmarks[metricKey] ?? null,
    cashValueEur: cashValueForMonths(allMonthlyRows, months, data.allSales),
  };
}

function cashValueForMonths(allMonthlyRows: KpiData["allMonthlyRows"], months: MonthWindow[], allSales: KpiData["allSales"]): number | null {
  let seen = false;
  let total = 0;
  for (const month of months) {
    const salesTotal = allSales
      .filter((sale) => !sale.isOrphan && sale.saleDate >= month.range.from && sale.saleDate <= month.range.to)
      .reduce((sum, sale) => sum + sale.totalPrice, 0);
    const row = allMonthlyRows.find((item) => item.year === month.year && item.month === month.month);
    if (salesTotal > 0) {
      seen = true;
      total += salesTotal;
    } else if (row?.cashContracted !== null && row?.cashContracted !== undefined) {
      seen = true;
      total += row.cashContracted;
    }
  }
  return seen ? total : null;
}

export async function calculateCashSnapshot(accountId: string, months = lastCompletedMonths(MEASUREMENT_MONTHS)): Promise<BaselineSnapshot | null> {
  const period = periodForMonths(months);
  if (!period) return null;
  const data = await loadKpiData(accountId);
  const value = cashValueForMonths(data.allMonthlyRows, months, data.allSales);
  if (value === null) return null;
  const sampleSize = months.filter((month) => {
    const hasSale = data.allSales.some((sale) => !sale.isOrphan && sale.saleDate >= month.range.from && sale.saleDate <= month.range.to);
    const row = data.allMonthlyRows.find((item) => item.year === month.year && item.month === month.month);
    return hasSale || row?.cashContracted !== null;
  }).length;
  return {
    metricKey: "cashContracted",
    unit: "eur",
    value,
    periodStart: period.start,
    periodEnd: period.end,
    sampleSize,
    source: "sales_or_monthly_metrics.cash_contracted",
    freshness: new Date().toISOString(),
    cashValueEur: value,
  };
}

export async function calculateBaseline(accountId: string, metricKey: string | null, months = lastCompletedMonths(MEASUREMENT_MONTHS)): Promise<BaselineSnapshot | null> {
  if (metricKey === "cashContracted") return calculateCashSnapshot(accountId, months);
  return calculateRateSnapshot(accountId, metricKey ?? "", months);
}

export function baselineFromMetaInsight(input: {
  metricKey: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  snapshot: InsightSnapshot;
}): BaselineSnapshot | null {
  const currentValue = input.snapshot.currentValue;
  const sampleSize = input.snapshot.sampleSize;
  if (
    typeof input.metricKey !== "string" ||
    typeof input.periodStart !== "string" ||
    typeof input.periodEnd !== "string" ||
    typeof currentValue !== "number" ||
    !Number.isFinite(currentValue) ||
    typeof sampleSize !== "number" ||
    !Number.isFinite(sampleSize) ||
    sampleSize <= 0
  ) {
    return null;
  }

  const isFraction = input.metricKey.endsWith("_rate") || input.metricKey === "profile_to_follow_rate" || input.metricKey === "instagram_engagement_per_follower";
  const isEuroValue = input.metricKey === "cash_per_lead";
  const value = isEuroValue ? currentValue / 100 : currentValue;
  const unit = isEuroValue ? "eur" : isFraction ? "fraction" : "count";
  return {
    metricKey: input.metricKey,
    unit,
    value,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    sampleSize: Math.round(sampleSize),
    source: "meta_ads",
    freshness: new Date().toISOString(),
    benchmarkValue: null,
    cashValueEur: isEuroValue ? value : null,
  };
}

export type MeasurementReadiness =
  | { ready: true; snapshot: MeasurementSnapshot }
  | { ready: false; reason: string };

export async function calculateComparableMeasurement(
  accountId: string,
  baseline: BaselineSnapshot | null,
  referenceDate = new Date(),
): Promise<MeasurementReadiness> {
  if (!baseline) return { ready: false, reason: "Aucune métrique comparable n'était disponible au lancement." };

  const currentMonths = lastCompletedMonths(MEASUREMENT_MONTHS, referenceDate);
  const currentPeriod = periodForMonths(currentMonths);
  if (!currentPeriod || currentPeriod.end <= baseline.periodEnd) {
    return { ready: false, reason: "La période après l'action n'est pas encore complète." };
  }

  const after = await calculateBaseline(accountId, baseline.metricKey, currentMonths);
  const minimumSample = baseline.unit === "eur" ? 1 : MIN_MEASUREMENT_SAMPLE;
  if (!after || after.sampleSize < minimumSample) {
    return { ready: false, reason: `Il faut au moins ${minimumSample} observations comparables.` };
  }

  const snapshot = compareBaselineSnapshots(baseline, after);
  if (!snapshot) return { ready: false, reason: "La métrique après action n'est pas compatible avec le baseline." };

  return {
    ready: true,
    snapshot,
  };
}
