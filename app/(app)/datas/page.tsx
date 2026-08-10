import { getBusinessProfile } from "@/lib/business/queries";
import { getPostLeadsSumByMonth } from "@/lib/content-posts/queries";
import { getCurrentUser } from "@/lib/current-user";
import { inRange } from "@/lib/dashboard/metrics";
import { periodToMonths } from "@/lib/diagnostic/completed-months";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { getLeadPipelineVolumesByMonth } from "@/lib/leads/stats";
import { getMonthlyMetricsForYear } from "@/lib/monthly-metrics/queries";
import {
  resolveMonthCashCollected,
  resolveMonthClosingTotals,
  resolveMonthSettingTotals,
} from "@/lib/monthly-metrics/resolve";
import { todayUtc } from "@/lib/date-range";
import { getSalesSummaryByMonth } from "@/lib/sales/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import type { ChartPoint, OverviewMetricOption } from "@/components/overview-revenue-chart";

import { DatasPageClient } from "./datas-page-client";
import { RevenueTrend } from "./revenue-trend";

const TREND_PERIODS = ["3", "6", "12", "year"];

export default async function DatasPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; trendPeriod?: string }>;
}) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "datas");
  const params = await searchParams;
  const today = todayUtc();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;

  const year = params.year ? Number(params.year) : currentYear;
  const trendPeriod = params.trendPeriod && TREND_PERIODS.includes(params.trendPeriod) ? params.trendPeriod : "6";

  const [monthRows, postLeadsByMonth, salesByMonth, pipelineVolumesByMonth, businessProfile, { allSettingEntries, allClosingEntries, allMonthlyRows, allCallSourcesByMonth }] =
    await Promise.all([
      getMonthlyMetricsForYear(accountId, year),
      getPostLeadsSumByMonth(accountId, year),
      getSalesSummaryByMonth(accountId, year),
      getLeadPipelineVolumesByMonth(accountId, year),
      getBusinessProfile(accountId),
      // Whole history, not just `year` — MonthModal can navigate across year
      // boundaries client-side (and the trend chart below spans up to 12
      // rolling months, which can itself cross a year boundary).
      getDiagnosticKpiRawData(accountId),
    ]);

  // Trend chart data — same aggregation as the old /overview page (removed),
  // kept here so the one genuinely unique thing that page did (CA/leads/RDV/
  // ventes over a rolling window, with an MRR goal line) isn't lost.
  const trendMonths = periodToMonths(trendPeriod);
  const monthlySeries = trendMonths.map(({ year: mYear, month: mMonth, range }) => {
    const monthlyRow = allMonthlyRows.find((row) => row.year === mYear && row.month === mMonth) ?? null;
    const dailySetting = allSettingEntries.filter((e) => inRange(e.date, range));
    const dailyClosing = allClosingEntries.filter((e) => inRange(e.date, range));
    const callSource = monthlyRow?.closingManualOverride ? null : allCallSourcesByMonth[`${mYear}-${String(mMonth).padStart(2, "0")}`] ?? null;
    const hasSetting = dailySetting.length > 0 || monthlyRow?.newFollowers !== null || monthlyRow?.callsBooked !== null;
    const hasClosing = callSource !== null || dailyClosing.length > 0 || monthlyRow?.callsTaken !== null || monthlyRow?.salesClosed !== null;

    const baseMonthSetting = resolveMonthSettingTotals(monthlyRow, dailySetting);
    const monthSetting = callSource && !monthlyRow?.settingManualOverride
      ? { ...baseMonthSetting, callsBooked: callSource.callsBooked }
      : baseMonthSetting;
    const monthClosing = callSource
      ? { callsAttended: callSource.callsTaken, salesClosed: callSource.salesClosed }
      : resolveMonthClosingTotals(monthlyRow, dailyClosing);
    const cash = resolveMonthCashCollected(monthlyRow);
    const label = new Date(Date.UTC(mYear, mMonth - 1, 1)).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" });

    return {
      label,
      ca: cash.amount,
      leads: hasSetting ? monthSetting.newSubscribers : null,
      rdv: callSource && !monthlyRow?.settingManualOverride ? callSource.callsBooked : hasSetting ? monthSetting.callsBooked : null,
      ventes: hasClosing ? monthClosing.salesClosed : null,
    };
  });
  const chartSeries: Record<OverviewMetricOption, ChartPoint[]> = {
    ca: monthlySeries.map((m) => ({ label: m.label, value: m.ca })),
    leads: monthlySeries.map((m) => ({ label: m.label, value: m.leads })),
    rdv: monthlySeries.map((m) => ({ label: m.label, value: m.rdv })),
    ventes: monthlySeries.map((m) => ({ label: m.label, value: m.ventes })),
  };

  return (
    <div className="flex flex-col gap-8">
      <DatasPageClient
        year={year}
        monthRows={monthRows}
        currentYear={currentYear}
        currentMonth={currentMonth}
        postLeadsByMonth={postLeadsByMonth}
        salesByMonth={salesByMonth}
        pipelineVolumesByMonth={pipelineVolumesByMonth}
        allSettingEntries={allSettingEntries}
        allClosingEntries={allClosingEntries}
        callSourcesByMonth={allCallSourcesByMonth}
      />
      <RevenueTrend year={year} trendPeriod={trendPeriod} chartSeries={chartSeries} goalValue={businessProfile.identity.mrrGoal} />
    </div>
  );
}
