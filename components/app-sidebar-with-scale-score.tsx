import { AppSidebar, type AppSidebarProps } from "@/components/app-sidebar";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { currentMonthWindow, lastCompletedMonths, type MonthWindow } from "@/lib/diagnostic/completed-months";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { computeScaleScore, describeScaleScoreGap, scaleScoreGapSources as getScaleScoreGapSources } from "@/lib/diagnostic/scale-score";
import { currentMonthNote, scaleScoreGapMessage } from "@/lib/diagnostic/scale-score-copy";
import { getDiagnosticKpiRawData, getScaleScoreInputs } from "@/lib/diagnostic/request-cache";
import { buildRevenueProjection, REVENUE_PROJECTION_MONTHS } from "@/lib/diagnostic/revenue-projection";
import { getFunnelBlockCatalog } from "@/lib/funnel-blocks/queries";
import { activeFunnelBlockEntries, activeLegacyMetricKeysFromBlocks, normalizeFunnelBlockSelection } from "@/lib/funnel-blocks/selection";
import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { monthDateRange } from "@/lib/date-range";
import { inRange } from "@/lib/dashboard/metrics";
import { monthKey, type MonthlyCallSource } from "@/lib/monthly-metrics/call-source";
import { EMPTY_MONTHLY_METRICS, type MonthlyMetricsInput } from "@/lib/monthly-metrics/types";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { computeCompletion, monthStatus } from "@/lib/monthly-metrics/completion";
import { resolveDailySourceOverlay } from "@/lib/monthly-metrics/resolve";
import { getScaleScoreDelta, getScaleScoreSparkline } from "@/lib/scale-score-history/queries";
import type { SaleRow } from "@/lib/sales/types";
import type { BusinessProfileData } from "@/lib/business/types";
import type { SectorKey } from "@/lib/benchmarks";

const SCALE_SCORE_PERIOD_MONTHS = 3;

const SCALAR_INPUT_KEYS: Record<string, keyof Omit<MonthlyMetricsInput, "acquisitionMetrics" | "acquisitionSourceMetrics">> = {
  new_followers: "newFollowers",
  first_messages: "firstMessages",
  conversations: "conversations",
  calls_proposed: "callsProposed",
  calls_booked: "callsBooked",
  calls_attended: "callsTaken",
  sales_closed: "salesClosed",
};

function metricValue(data: MonthlyMetricsInput, metricKey: string): number | null {
  const scalarKey = SCALAR_INPUT_KEYS[metricKey];
  return scalarKey ? data[scalarKey] ?? null : data.acquisitionMetrics?.[metricKey] ?? null;
}

function latestMissingMetricMonth({
  months,
  rows,
  metricKeys,
  settingEntries,
  closingEntries,
  callSourcesByMonth,
  allSales,
  callTrackingConnected,
}: {
  months: MonthWindow[];
  rows: MonthlyMetricsRow[];
  metricKeys: ReadonlySet<string>;
  settingEntries: (typeof settingKpiEntries.$inferSelect)[];
  closingEntries: (typeof closingKpiEntries.$inferSelect)[];
  callSourcesByMonth: Record<string, MonthlyCallSource>;
  allSales: SaleRow[];
  callTrackingConnected: boolean;
}): Pick<MonthWindow, "year" | "month"> | null {
  if (metricKeys.size === 0) return null;

  for (const month of months.slice().reverse()) {
    const row = rows.find((candidate) => candidate.year === month.year && candidate.month === month.month) ?? null;
    const salesClosed = allSales.filter((sale) => !sale.isOrphan && inRange(sale.saleDate, month.range)).length;
    const overlay = resolveDailySourceOverlay(
      monthDateRange(month.year, month.month),
      settingEntries,
      closingEntries,
      {
        settingManualOverride: row?.settingManualOverride,
        closingManualOverride: row?.closingManualOverride,
      },
      callSourcesByMonth[monthKey(month.year, month.month)] ?? null,
      { callTrackingConnected, ...(salesClosed > 0 ? { salesClosed } : {}) }
    );
    const data: MonthlyMetricsInput = { ...EMPTY_MONTHLY_METRICS, ...(row ?? {}), ...overlay.overrides };
    if (Array.from(metricKeys).some((metricKey) => metricValue(data, metricKey) === null)) {
      return { year: month.year, month: month.month };
    }
  }

  return null;
}

type AppSidebarWithScaleScoreProps = Omit<
  AppSidebarProps,
  "scaleScore" | "scaleScoreGapText" | "scaleScoreGapSources" | "scaleScoreMonthNote" | "scaleScoreDelta7d" | "scaleScoreDelta30d" | "scaleScoreSparkline" | "currentMonthlyRevenue" | "potentialMonthlyRevenue"
> & {
  accountId: string;
  businessProfile: BusinessProfileData;
  sector: SectorKey | null;
  canSeeScaleScore: boolean;
  callTrackingConnected: boolean;
};

// The Scale Score is useful chrome, but it is not part of the page the user
// asked to open. Keep its heavier diagnostic reads behind a Server Component
// boundary so the main content can stream with the sidebar shell immediately.
export async function AppSidebarWithScaleScore({
  accountId,
  businessProfile,
  sector,
  canSeeScaleScore,
  callTrackingConnected,
  ...sidebarProps
}: AppSidebarWithScaleScoreProps) {
  let scaleScore: AppSidebarProps["scaleScore"] = null;
  let scaleScoreGapText: string | null = null;
  let scaleScoreGapSources: AppSidebarProps["scaleScoreGapSources"] = [];
  let scaleScoreMonthNote: string | null = null;
  let scaleScoreDelta7d: number | null = null;
  let scaleScoreDelta30d: number | null = null;
  let scaleScoreSparkline: AppSidebarProps["scaleScoreSparkline"] = [];
  let currentMonthlyRevenue: number | null = null;
  let potentialMonthlyRevenue: number | null = null;
  const [funnelBlockCatalog, scaleScoreInputs, benchmarks] = await Promise.all([
    getFunnelBlockCatalog(),
    canSeeScaleScore ? getScaleScoreInputs(accountId) : Promise.resolve(null),
    canSeeScaleScore ? getDiagnosticBenchmarks(sector) : Promise.resolve(null),
  ]);
  const funnelBlockSelection = normalizeFunnelBlockSelection(businessProfile.acquisition, funnelBlockCatalog);
  const activeFunnelEntries = activeFunnelBlockEntries(funnelBlockSelection, funnelBlockCatalog);
  const activeMetricKeys = activeLegacyMetricKeysFromBlocks(funnelBlockSelection, funnelBlockCatalog);

  if (canSeeScaleScore && scaleScoreInputs && benchmarks) {
    const { allSettingEntries, allClosingEntries, allMonthlyRows } = scaleScoreInputs;
    const scaleScoreMonths = lastCompletedMonths(SCALE_SCORE_PERIOD_MONTHS);
    const rawData = await getDiagnosticKpiRawData(accountId);
    const acquisitionInputKeys = new Set(
      activeFunnelEntries
        .filter((entry) => entry.family !== "conversion")
        .flatMap((entry) => entry.steps.map((step) => step.metricKey))
    );
    const salesInputKeys = new Set(
      activeFunnelEntries
        .filter((entry) => entry.family === "conversion")
        .flatMap((entry) => entry.steps.map((step) => step.metricKey))
    );
    const acquisitionTargetMonth = latestMissingMetricMonth({
      months: scaleScoreMonths,
      rows: allMonthlyRows,
      metricKeys: acquisitionInputKeys,
      settingEntries: rawData.allSettingEntries,
      closingEntries: rawData.allClosingEntries,
      callSourcesByMonth: rawData.allCallSourcesByMonth,
      allSales: rawData.allSales,
      callTrackingConnected,
    });
    const salesTargetMonth = latestMissingMetricMonth({
      months: scaleScoreMonths,
      rows: allMonthlyRows,
      metricKeys: salesInputKeys,
      settingEntries: rawData.allSettingEntries,
      closingEntries: rawData.allClosingEntries,
      callSourcesByMonth: rawData.allCallSourcesByMonth,
      allSales: rawData.allSales,
      callTrackingConnected,
    });
    const { settingTotals, closingTotals, cashContractedTotal, emptyMonths } = aggregatePeriodTotals({
      months: scaleScoreMonths,
      allMonthlyRows,
      allSettingEntries,
      allClosingEntries,
      callTrackingConnected,
    });
    scaleScore = computeScaleScore({
      settingTotals,
      closingTotals,
      benchmarks,
      businessProfile,
      cashContractedTotal,
      activeMetricKeys,
    });

    if (scaleScore.score === null) {
      const actionablePillars = scaleScore.pillars.filter((pillar) => {
        if (pillar.key === "acquisition") return acquisitionTargetMonth !== null;
        if (pillar.key === "vente") return salesTargetMonth !== null;
        return true;
      });
      const gap = describeScaleScoreGap(emptyMonths, actionablePillars);
      scaleScoreGapText = gap ? scaleScoreGapMessage(gap) : null;
      scaleScoreGapSources = getScaleScoreGapSources(gap, {
        acquisition: acquisitionTargetMonth ?? undefined,
        sales: salesTargetMonth ?? undefined,
      });

      const currentMonth = currentMonthWindow();
      const currentMonthRow = allMonthlyRows.find((row) => row.year === currentMonth.year && row.month === currentMonth.month) ?? null;
      const overlay = resolveDailySourceOverlay(currentMonth.range, allSettingEntries, allClosingEntries, {
        settingManualOverride: currentMonthRow?.settingManualOverride,
        closingManualOverride: currentMonthRow?.closingManualOverride,
      });
      const currentMonthData = { ...(currentMonthRow ?? EMPTY_MONTHLY_METRICS), ...overlay.overrides };
      const hasDataEntryTarget = scaleScoreGapSources.some((source) => source.key !== "delivery");
      if (hasDataEntryTarget && monthStatus(computeCompletion(currentMonthData)) !== "empty") scaleScoreMonthNote = currentMonthNote(currentMonth);
    }

    const projectionMonths = lastCompletedMonths(REVENUE_PROJECTION_MONTHS);
    const projectionTotals = aggregatePeriodTotals({
      months: projectionMonths,
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
    const projectionPoints = projectionTotals.hasAnySourceData
      ? computeDiagnosticPoints({
          settingTotals: projectionTotals.settingTotals,
          closingTotals: projectionTotals.closingTotals,
          benchmarks,
          businessProfile,
          cashContractedTotal: projectionTotals.cashContractedTotal,
          activeMetricKeys,
          periodMonths: projectionMonths.length,
        })
      : [];
    const revenueProjection = buildRevenueProjection({
      cashContractedTotal: projectionTotals.cashContractedTotal,
      monthsCount: REVENUE_PROJECTION_MONTHS,
      bottleneckGain: projectionPoints[0]?.monthlyGain ?? null,
    });
    currentMonthlyRevenue = revenueProjection.averageMonthlyRevenue;
    potentialMonthlyRevenue = revenueProjection.optimizedMonthlyRevenue;

    if (scaleScore.score !== null) {
      [scaleScoreDelta7d, scaleScoreDelta30d, scaleScoreSparkline] = await Promise.all([
        getScaleScoreDelta(accountId, 7, scaleScore.score),
        getScaleScoreDelta(accountId, 30, scaleScore.score),
        getScaleScoreSparkline(accountId),
      ]);
    }
  }

  return (
    <AppSidebar
      {...sidebarProps}
      scaleScore={scaleScore}
      scaleScoreGapText={scaleScoreGapText}
      scaleScoreGapSources={scaleScoreGapSources}
      scaleScoreMonthNote={scaleScoreMonthNote}
      scaleScoreDelta7d={scaleScoreDelta7d}
      scaleScoreDelta30d={scaleScoreDelta30d}
      scaleScoreSparkline={scaleScoreSparkline}
      currentMonthlyRevenue={currentMonthlyRevenue}
      potentialMonthlyRevenue={potentialMonthlyRevenue}
    />
  );
}
