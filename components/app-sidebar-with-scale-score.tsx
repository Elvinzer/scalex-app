import { AppSidebar, type AppSidebarProps } from "@/components/app-sidebar";
import { EMPTY_MONTHLY_METRICS } from "@/lib/monthly-metrics/types";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { currentMonthWindow, lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { computeScaleScore, describeScaleScoreGap, scaleScoreGapSources as getScaleScoreGapSources } from "@/lib/diagnostic/scale-score";
import { currentMonthNote, scaleScoreGapMessage } from "@/lib/diagnostic/scale-score-copy";
import { getDiagnosticKpiRawData, getScaleScoreInputs } from "@/lib/diagnostic/request-cache";
import { buildRevenueProjection, REVENUE_PROJECTION_MONTHS } from "@/lib/diagnostic/revenue-projection";
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { activeLegacyMetricKeys, normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import { computeCompletion, monthStatus } from "@/lib/monthly-metrics/completion";
import { resolveDailySourceOverlay } from "@/lib/monthly-metrics/resolve";
import { getScaleScoreDelta, getScaleScoreSparkline } from "@/lib/scale-score-history/queries";
import type { BusinessProfileData } from "@/lib/business/types";
import type { SectorKey } from "@/lib/benchmarks";

const SCALE_SCORE_PERIOD_MONTHS = 3;

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
  const [acquisitionCatalog, scaleScoreInputs, benchmarks] = await Promise.all([
    getAcquisitionFunnelCatalog(),
    canSeeScaleScore ? getScaleScoreInputs(accountId) : Promise.resolve(null),
    canSeeScaleScore ? getDiagnosticBenchmarks(sector) : Promise.resolve(null),
  ]);
  const acquisitionSelection = normalizeAcquisitionSelection(businessProfile.acquisition, acquisitionCatalog);

  if (canSeeScaleScore && scaleScoreInputs && benchmarks && acquisitionCatalog) {
    const { allSettingEntries, allClosingEntries, allMonthlyRows } = scaleScoreInputs;
    const scaleScoreMonths = lastCompletedMonths(SCALE_SCORE_PERIOD_MONTHS);
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
      activeMetricKeys: activeLegacyMetricKeys(acquisitionSelection, acquisitionCatalog),
    });

    if (scaleScore.score === null) {
      const gap = describeScaleScoreGap(emptyMonths, scaleScore.pillars);
      scaleScoreGapText = gap ? scaleScoreGapMessage(gap) : null;
      scaleScoreGapSources = getScaleScoreGapSources(gap);

      const currentMonth = currentMonthWindow();
      const currentMonthRow = allMonthlyRows.find((row) => row.year === currentMonth.year && row.month === currentMonth.month) ?? null;
      const overlay = resolveDailySourceOverlay(currentMonth.range, allSettingEntries, allClosingEntries, {
        settingManualOverride: currentMonthRow?.settingManualOverride,
        closingManualOverride: currentMonthRow?.closingManualOverride,
      });
      const currentMonthData = { ...(currentMonthRow ?? EMPTY_MONTHLY_METRICS), ...overlay.overrides };
      if (monthStatus(computeCompletion(currentMonthData)) !== "empty") scaleScoreMonthNote = currentMonthNote(currentMonth);
    }

    const rawData = await getDiagnosticKpiRawData(accountId);
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
          activeMetricKeys: activeLegacyMetricKeys(acquisitionSelection, acquisitionCatalog),
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
