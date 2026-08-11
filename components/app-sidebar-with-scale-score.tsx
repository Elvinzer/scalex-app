import { AppSidebar, type AppSidebarProps } from "@/components/app-sidebar";
import { EMPTY_MONTHLY_METRICS } from "@/lib/monthly-metrics/types";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { currentMonthWindow, lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeScaleScore, describeScaleScoreGap } from "@/lib/diagnostic/scale-score";
import { currentMonthNote, scaleScoreGapMessage } from "@/lib/diagnostic/scale-score-copy";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { activeLegacyMetricKeys, normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import { activeFunnelRoutes } from "@/lib/acquisition-funnels/routes";
import { computeCompletion, monthStatus } from "@/lib/monthly-metrics/completion";
import { resolveDailySourceOverlay } from "@/lib/monthly-metrics/resolve";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { getScaleScoreDelta, getScaleScoreSparkline } from "@/lib/scale-score-history/queries";
import type { BusinessProfileData } from "@/lib/business/types";
import type { SectorKey } from "@/lib/benchmarks";

const SCALE_SCORE_PERIOD_MONTHS = 3;

type AppSidebarWithScaleScoreProps = Omit<
  AppSidebarProps,
  "scaleScore" | "scaleScoreGapText" | "scaleScoreMonthNote" | "scaleScoreDelta7d" | "scaleScoreDelta30d" | "scaleScoreSparkline" | "currentMonthlyRevenue" | "potentialMonthlyRevenue"
> & {
  accountId: string;
  businessProfile: BusinessProfileData;
  sector: SectorKey | null;
  canSeeScaleScore: boolean;
};

// The Scale Score is useful chrome, but it is not part of the page the user
// asked to open. Keep its heavier diagnostic reads behind a Server Component
// boundary so the main content can stream with the sidebar shell immediately.
export async function AppSidebarWithScaleScore({
  accountId,
  businessProfile,
  sector,
  canSeeScaleScore,
  ...sidebarProps
}: AppSidebarWithScaleScoreProps) {
  let scaleScore: AppSidebarProps["scaleScore"] = null;
  let scaleScoreGapText: string | null = null;
  let scaleScoreMonthNote: string | null = null;
  let scaleScoreDelta7d: number | null = null;
  let scaleScoreDelta30d: number | null = null;
  let scaleScoreSparkline: AppSidebarProps["scaleScoreSparkline"] = [];
  let currentMonthlyRevenue: number | null = null;
  let potentialMonthlyRevenue: number | null = null;
  const [acquisitionCatalog, scaleScoreInputs, benchmarks] = await Promise.all([
    getAcquisitionFunnelCatalog(),
    canSeeScaleScore ? getDiagnosticKpiRawData(accountId) : Promise.resolve(null),
    canSeeScaleScore ? getDiagnosticBenchmarks(sector) : Promise.resolve(null),
  ]);

  const acquisitionSelection = normalizeAcquisitionSelection(businessProfile.acquisition, acquisitionCatalog);
  const acquisitionSubpages = [
    ...activeFunnelRoutes(acquisitionSelection, acquisitionCatalog).map((route) => ({
      href: route.href,
      label: route.primary ? `${route.label} · principal` : route.label,
    })),
    { href: "/business#acquisition", label: "+ Ajouter un parcours" },
  ];

  if (canSeeScaleScore && scaleScoreInputs && benchmarks && acquisitionCatalog) {
    const { allSettingEntries, allClosingEntries, allMonthlyRows } = scaleScoreInputs;
    const { settingTotals, closingTotals, cashContractedTotal, emptyMonths } = aggregatePeriodTotals({
      months: lastCompletedMonths(SCALE_SCORE_PERIOD_MONTHS),
      allMonthlyRows,
      allSettingEntries,
      allClosingEntries,
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

      const currentMonth = currentMonthWindow();
      const currentMonthRow = allMonthlyRows.find((row) => row.year === currentMonth.year && row.month === currentMonth.month) ?? null;
      const overlay = resolveDailySourceOverlay(currentMonth.range, allSettingEntries, allClosingEntries, {
        settingManualOverride: currentMonthRow?.settingManualOverride,
        closingManualOverride: currentMonthRow?.closingManualOverride,
      });
      const currentMonthData = { ...(currentMonthRow ?? EMPTY_MONTHLY_METRICS), ...overlay.overrides };
      if (monthStatus(computeCompletion(currentMonthData)) !== "empty") scaleScoreMonthNote = currentMonthNote(currentMonth);
    }

    if (cashContractedTotal > 0) {
      const { toImplement } = await computeLeverOpportunities({
        accountId,
        businessProfile,
        settingTotals,
        closingTotals,
        cashContractedTotal,
        periodMonths: SCALE_SCORE_PERIOD_MONTHS,
        months: lastCompletedMonths(SCALE_SCORE_PERIOD_MONTHS),
      });
      const topDiscoveryGain = toImplement.slice(0, 3).reduce((sum, opportunity) => sum + (opportunity.impactAmountEur ?? 0), 0);
      currentMonthlyRevenue = cashContractedTotal / SCALE_SCORE_PERIOD_MONTHS;
      potentialMonthlyRevenue = currentMonthlyRevenue + topDiscoveryGain;
    }

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
      scaleScoreMonthNote={scaleScoreMonthNote}
      scaleScoreDelta7d={scaleScoreDelta7d}
      scaleScoreDelta30d={scaleScoreDelta30d}
      scaleScoreSparkline={scaleScoreSparkline}
      currentMonthlyRevenue={currentMonthlyRevenue}
      potentialMonthlyRevenue={potentialMonthlyRevenue}
      acquisitionSubpages={acquisitionSubpages}
    />
  );
}
