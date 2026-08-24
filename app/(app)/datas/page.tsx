import { getBusinessProfile } from "@/lib/business/queries";
import { getPostLeadsSumByMonth } from "@/lib/content-posts/queries";
import { getCurrentUser } from "@/lib/current-user";
import { inRange } from "@/lib/dashboard/metrics";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { periodToMonths } from "@/lib/diagnostic/completed-months";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { getLeadPipelineVolumesByMonth } from "@/lib/leads/stats";
import { getMonthlyMetricsForYear } from "@/lib/monthly-metrics/queries";
import { isMonthlyCallSourceAuthoritative } from "@/lib/monthly-metrics/call-source";
import { resolveMonthCashCollected } from "@/lib/monthly-metrics/resolve";
import { todayUtc } from "@/lib/date-range";
import { summarize } from "@/lib/sales/installments";
import { getSalesSummaryByMonth } from "@/lib/sales/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { activeFunnelEntries, normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";

import type { ChartPoint, OverviewMetricOption } from "@/components/overview-revenue-chart";

import { DatasPageClient } from "./datas-page-client";

const TREND_PERIODS = ["3", "6", "12", "year"];

export default async function DatasPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; trendPeriod?: string }>;
}) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "datas");
  const params = await searchParams;
  const today = todayUtc();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;
  const callTrackingConnected = Boolean(user?.iclosedConnected || user?.calendlyConnected);

  const year = params.year ? Number(params.year) : currentYear;
  const trendPeriod = params.trendPeriod && TREND_PERIODS.includes(params.trendPeriod) ? params.trendPeriod : "6";

  const [monthRows, postLeadsByMonth, salesByMonth, pipelineVolumesByMonth, businessProfile, rawData, acquisitionCatalog] =
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
      getAcquisitionFunnelCatalog(),
    ]);
  const acquisitionSelection = normalizeAcquisitionSelection(businessProfile.acquisition, acquisitionCatalog);
  const activeMetricFields = Array.from(
    new Map(
      activeFunnelEntries(acquisitionSelection, acquisitionCatalog)
        .flatMap((entry) => entry.steps)
        .map((stage) => [stage.inputMetricKey, stage] as const)
    ).values()
  );

  // Trend chart data — same aggregation as the old /overview page (removed),
  // kept here so the one genuinely unique thing that page did (CA/leads/RDV/
  // ventes over a rolling window, with an MRR goal line) isn't lost.
  const trendMonths = periodToMonths(trendPeriod);
  const monthlySeries = trendMonths.map(({ year: mYear, month: mMonth, range }) => {
    const monthlyRow = rawData.allMonthlyRows.find((row) => row.year === mYear && row.month === mMonth) ?? null;
    const dailySetting = rawData.allSettingEntries.filter((e) => inRange(e.date, range));
    const dailyClosing = rawData.allClosingEntries.filter((e) => inRange(e.date, range));
    const callSource = rawData.allCallSourcesByMonth[`${mYear}-${String(mMonth).padStart(2, "0")}`] ?? null;
    const validSales = rawData.allSales.filter((sale) => !sale.isOrphan && inRange(sale.saleDate, range));
    const monthTotals = aggregatePeriodTotals({
      months: [{ year: mYear, month: mMonth, range }],
      allMonthlyRows: rawData.allMonthlyRows,
      allSettingEntries: rawData.allSettingEntries,
      allClosingEntries: rawData.allClosingEntries,
      callSourcesByMonth: rawData.allCallSourcesByMonth,
      callTrackingConnected,
      allSales: rawData.allSales,
      allLeads: rawData.allLeads,
      allLeadStageHistory: rawData.allLeadStageHistory,
      allEmailCampaigns: rawData.allEmailCampaigns,
      allMetaMetrics: rawData.allMetaMetrics,
      allNativeBookingLeads: rawData.allNativeBookingLeads,
    });
    const hasSetting =
      dailySetting.length > 0 ||
      (monthlyRow?.newFollowers !== null && monthlyRow?.newFollowers !== undefined) ||
      (monthlyRow?.callsBooked !== null && monthlyRow?.callsBooked !== undefined) ||
      isMonthlyCallSourceAuthoritative(callSource, callTrackingConnected);
    const hasClosing =
      isMonthlyCallSourceAuthoritative(callSource, callTrackingConnected) ||
      dailyClosing.length > 0 ||
      (monthlyRow?.callsTaken !== null && monthlyRow?.callsTaken !== undefined) ||
      (monthlyRow?.salesClosed !== null && monthlyRow?.salesClosed !== undefined) ||
      validSales.length > 0;
    const salesCollected = validSales.reduce((sum, sale) => sum + summarize(sale.totalPrice, sale.installments).paidTotal, 0);
    const cash = validSales.length > 0 ? { amount: salesCollected } : resolveMonthCashCollected(monthlyRow);
    const label = new Date(Date.UTC(mYear, mMonth - 1, 1)).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" });

    return {
      label,
      ca: cash.amount,
      leads: hasSetting ? monthTotals.settingTotals.newSubscribers : null,
      rdv: hasSetting ? monthTotals.settingTotals.callsBooked : null,
      ventes: hasClosing ? monthTotals.closingTotals.salesClosed : null,
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
        allSettingEntries={rawData.allSettingEntries}
        allClosingEntries={rawData.allClosingEntries}
        allMonthlyRows={rawData.allMonthlyRows}
        callSourcesByMonth={rawData.allCallSourcesByMonth}
        callTrackingConnected={callTrackingConnected}
        activeMetricFields={activeMetricFields}
        trendPeriod={trendPeriod}
        chartSeries={chartSeries}
        goalValue={businessProfile.identity.mrrGoal}
      />
    </div>
  );
}
