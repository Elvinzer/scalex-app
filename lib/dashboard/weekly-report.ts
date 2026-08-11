import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { weeklyReports } from "@/db/schema";
import { computeClosingRates } from "@/lib/closing/metrics";
import { formatEur } from "@/lib/currency";
import { toIsoDate, todayUtc, type DateRange } from "@/lib/date-range";
import { countDelta, inRange, rateDelta } from "@/lib/dashboard/metrics";
import { aggregateSalesCallsInRange, isMonthlyCallSourceAvailable, type SalesCallKpiRecord } from "@/lib/monthly-metrics/call-source";
import { formatPercent } from "@/lib/setting/funnel";
import type { SaleRow } from "@/lib/sales/types";

import type { WeeklyReportBottleneck, WeeklyReportStatCard } from "./weekly-report-types";

export type { WeeklyReportBottleneck, WeeklyReportStatCard } from "./weekly-report-types";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");
const UNIT_LABEL = "semaine précédente";

// Monday of the ISO week containing `date` — same 3-line construction as the
// private mondayOfWeek in lib/scale-score-history/queries.ts, duplicated
// locally rather than exported/shared (same precedent already used in this
// codebase for small date-math helpers, e.g. round1 in lib/levers/opportunities.ts).
function mondayOfWeek(date: Date): Date {
  const day = date.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  return new Date(date.getTime() - diffToMonday * 24 * 60 * 60 * 1000);
}

// The week that just ended (Monday–Sunday) relative to `reference` — NOT the
// week in progress. The Monday cron summarizes "last week", matching the
// email's existing framing of a Monday-morning recap.
export function lastCompleteWeekRange(reference: Date = todayUtc()): { weekStart: string; range: DateRange } {
  const thisMonday = mondayOfWeek(reference);
  const lastMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
  const lastSunday = new Date(thisMonday.getTime() - 24 * 60 * 60 * 1000);
  return { weekStart: toIsoDate(lastMonday), range: { from: toIsoDate(lastMonday), to: toIsoDate(lastSunday) } };
}

type SettingEntry = { date: string; newSubscribers: number; callsBooked: number };
type ClosingEntry = { date: string; callsAttended: number; salesClosed: number };

// 5 cards, each a real week-over-week figure — no monthly_metrics involved
// (that table has no weekly precision at all, see the plan's Context
// section). CA contracté/Nouveaux clients both come from the SAME `sales`
// rows so the two numbers agree with each other; Leads/RDV come from the
// daily settingKpiEntries; Taux de closing from closingKpiEntries — all
// tables with a real per-day date, unlike monthly_metrics.
export function computeWeeklyStatCards({
  weekRange,
  previousWeekRange,
  sales,
  settingEntries,
  closingEntries,
  callRecords = [],
}: {
  weekRange: DateRange;
  previousWeekRange: DateRange;
  sales: SaleRow[];
  settingEntries: SettingEntry[];
  closingEntries: ClosingEntry[];
  callRecords?: SalesCallKpiRecord[];
}): WeeklyReportStatCard[] {
  const salesThisWeek = sales.filter((sale) => !sale.isOrphan && inRange(sale.saleDate, weekRange));
  const salesPreviousWeek = sales.filter((sale) => !sale.isOrphan && inRange(sale.saleDate, previousWeekRange));

  const settingThisWeek = settingEntries.filter((entry) => inRange(entry.date, weekRange));
  const settingPreviousWeek = settingEntries.filter((entry) => inRange(entry.date, previousWeekRange));

  const closingThisWeek = closingEntries.filter((entry) => inRange(entry.date, weekRange));
  const closingPreviousWeek = closingEntries.filter((entry) => inRange(entry.date, previousWeekRange));
  const callsThisWeek = aggregateSalesCallsInRange(callRecords, weekRange);
  const callsPreviousWeek = aggregateSalesCallsInRange(callRecords, previousWeekRange);

  const caThisWeek = salesThisWeek.reduce((sum, sale) => sum + sale.totalPrice, 0);
  const caPreviousWeek = salesPreviousWeek.reduce((sum, sale) => sum + sale.totalPrice, 0);

  const leadsThisWeek = settingThisWeek.reduce((sum, entry) => sum + entry.newSubscribers, 0);
  const leadsPreviousWeek = settingPreviousWeek.reduce((sum, entry) => sum + entry.newSubscribers, 0);

  const rdvThisWeek = isMonthlyCallSourceAvailable(callsThisWeek) ? callsThisWeek.callsBooked : settingThisWeek.reduce((sum, entry) => sum + entry.callsBooked, 0);
  const rdvPreviousWeek = isMonthlyCallSourceAvailable(callsPreviousWeek) ? callsPreviousWeek.callsBooked : settingPreviousWeek.reduce((sum, entry) => sum + entry.callsBooked, 0);

  const closingTotalsThisWeek = {
    callsAttended: isMonthlyCallSourceAvailable(callsThisWeek) ? callsThisWeek.callsTaken : closingThisWeek.reduce((sum, entry) => sum + entry.callsAttended, 0),
    salesClosed: salesThisWeek.length > 0
      ? salesThisWeek.length
      : isMonthlyCallSourceAvailable(callsThisWeek)
        ? callsThisWeek.salesClosed
        : closingThisWeek.reduce((sum, entry) => sum + entry.salesClosed, 0),
  };
  const closingTotalsPreviousWeek = {
    callsAttended: isMonthlyCallSourceAvailable(callsPreviousWeek) ? callsPreviousWeek.callsTaken : closingPreviousWeek.reduce((sum, entry) => sum + entry.callsAttended, 0),
    salesClosed: salesPreviousWeek.length > 0
      ? salesPreviousWeek.length
      : isMonthlyCallSourceAvailable(callsPreviousWeek)
        ? callsPreviousWeek.salesClosed
        : closingPreviousWeek.reduce((sum, entry) => sum + entry.salesClosed, 0),
  };
  const closingRateThisWeek = computeClosingRates(closingTotalsThisWeek, rdvThisWeek).closingRate;
  const closingRatePreviousWeek = computeClosingRates(closingTotalsPreviousWeek, rdvPreviousWeek).closingRate;

  const caDelta = countDelta(caThisWeek, caPreviousWeek, UNIT_LABEL);
  const clientsDelta = countDelta(salesThisWeek.length, salesPreviousWeek.length, UNIT_LABEL);
  const leadsDelta = countDelta(leadsThisWeek, leadsPreviousWeek, UNIT_LABEL);
  const rdvDelta = countDelta(rdvThisWeek, rdvPreviousWeek, UNIT_LABEL);
  const closingDelta = rateDelta(closingRateThisWeek, closingRatePreviousWeek, UNIT_LABEL);

  return [
    { key: "ca_contracte", label: "CA contracté", valueLabel: formatEur(caThisWeek), deltaLabel: caDelta.label, deltaDirection: caDelta.direction },
    {
      key: "nouveaux_clients",
      label: "Nouveaux clients",
      valueLabel: NUMBER_FORMAT.format(salesThisWeek.length),
      deltaLabel: clientsDelta.label,
      deltaDirection: clientsDelta.direction,
    },
    { key: "leads", label: "Leads", valueLabel: NUMBER_FORMAT.format(leadsThisWeek), deltaLabel: leadsDelta.label, deltaDirection: leadsDelta.direction },
    { key: "rdv", label: "RDV réservés", valueLabel: NUMBER_FORMAT.format(rdvThisWeek), deltaLabel: rdvDelta.label, deltaDirection: rdvDelta.direction },
    {
      key: "closing_rate",
      label: "Taux de closing",
      valueLabel: closingRateThisWeek === null ? "—" : formatPercent(closingRateThisWeek),
      deltaLabel: closingDelta?.label ?? null,
      deltaDirection: closingDelta?.direction ?? null,
    },
  ];
}

export type WeeklyReportRow = {
  id: string;
  weekStart: string;
  statsSnapshot: WeeklyReportStatCard[];
  bottleneck: WeeklyReportBottleneck | null;
  score: number | null;
  scoreDelta: number | null;
  generatedAt: string;
};

function toRow(row: typeof weeklyReports.$inferSelect): WeeklyReportRow {
  return {
    id: row.id,
    weekStart: row.weekStart,
    statsSnapshot: row.statsSnapshot,
    bottleneck: row.bottleneck ?? null,
    score: row.score,
    scoreDelta: row.scoreDelta,
    generatedAt: row.generatedAt.toISOString(),
  };
}

// Most recent first — the Dashboard button always opens reports[0] (either
// the just-generated current week, or the last complete one if this week's
// cron hasn't run yet), with the rest as the secondary "past weeks" list.
export async function getRecentWeeklyReports(accountId: string, limit = 8): Promise<WeeklyReportRow[]> {
  const rows = await db
    .select()
    .from(weeklyReports)
    .where(eq(weeklyReports.userId, accountId))
    .orderBy(desc(weeklyReports.weekStart))
    .limit(limit);
  return rows.map(toRow);
}

// Idempotent by design — the Monday cron may be replayed (Inngest step
// retries are already memoized, but a full function re-run isn't), and
// re-generating the same week's snapshot must update it, never duplicate it.
export async function upsertWeeklyReport(data: {
  userId: string;
  weekStart: string;
  statsSnapshot: WeeklyReportStatCard[];
  bottleneck: WeeklyReportBottleneck | null;
  score: number | null;
  scoreDelta: number | null;
}): Promise<void> {
  await db
    .insert(weeklyReports)
    .values({ ...data, generatedAt: new Date() })
    .onConflictDoUpdate({
      target: [weeklyReports.userId, weeklyReports.weekStart],
      set: {
        statsSnapshot: data.statsSnapshot,
        bottleneck: data.bottleneck,
        score: data.score,
        scoreDelta: data.scoreDelta,
        generatedAt: new Date(),
      },
    });
}
