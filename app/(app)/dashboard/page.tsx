import { eq } from "drizzle-orm";
import { after } from "next/server";
import { Suspense } from "react";

import { DashboardLossHero, DashboardLossHeroSkeleton } from "./dashboard-loss-hero";
import { RevenueActionCenter, RevenueActionCenterSkeleton } from "./revenue-action-center";
import { TechnicalAlertsSection } from "./technical-alerts-section";
import { WeeklyReportDialog } from "./weekly-report-dialog";
import { FalcoEmptyState } from "@/components/falco/falco-empty-state";
import { AcquisitionFunnelInferredBanner } from "@/components/acquisition-funnel-inferred-banner";
import { MetricCard } from "@/components/metric-card";
import { db } from "@/db";
import { calendlyConnections, iclosedConnections } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { currentMonthWindow, lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeDiagnosticPoints, resolveDealPrice } from "@/lib/diagnostic/cascade";
import { getContentDiagnosticBenchmarks } from "@/lib/diagnostic/content-benchmarks";
import { getPipelineDiagnosticBenchmark } from "@/lib/diagnostic/pipeline-metrics";
import { computeContentRetentionSummary } from "@/lib/diagnostic/content-retention";
import { aggregateContentTotals } from "@/lib/diagnostic/content-metrics";
import { filterVisibleContentPosts } from "@/lib/content-posts/visibility";
import { isSameReportingMonth, resolveContentReportingMonth } from "@/lib/content-posts/reporting-period";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { buildBottleneckFunnel } from "@/lib/dashboard/bottleneck";
import type { BottleneckFunnelVariant } from "@/lib/dashboard/bottleneck";
import { buildAdaptiveFunnel } from "@/lib/acquisition-funnels/metrics";
import { getAcquisitionFunnelBenchmarks, getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { activeFunnelEntries, activeLegacyMetricKeys, normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import { currentIsoWeekRange, inRange, buildMetricCards } from "@/lib/dashboard/metrics";
import { buildTechnicalAlerts } from "@/lib/dashboard/technical-alerts";
import { getRecentWeeklyReports } from "@/lib/dashboard/weekly-report";
import { getCurrentUser } from "@/lib/current-user";
import { isMonthlyCallSourceAuthoritative, monthKey, type MonthlyCallSource } from "@/lib/monthly-metrics/call-source";
import { emptyMonthRow } from "@/lib/monthly-metrics/queries";
import { resolveDailySourceOverlay } from "@/lib/monthly-metrics/resolve";
import { monthDateRange } from "@/lib/date-range";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";
import { measureAsync } from "@/lib/perf/timing";
import { getLocale, getTranslations } from "next-intl/server";
import { track } from "@/lib/analytics";
import { buildAcquisitionStageVolumes } from "@/lib/acquisition-funnels/stage-volumes";
import { BottleneckFunnel } from "./bottleneck-funnel";
import { FunnelSourceFilter } from "@/components/funnel-source-filter";
import { buildFunnelBlockBottleneck, buildFunnelBlockMetricValues } from "@/lib/funnel-blocks/bottleneck";
import { getFunnelBlockBenchmarks, getFunnelBlockCatalog } from "@/lib/funnel-blocks/queries";
import { normalizeFunnelBlockSelection } from "@/lib/funnel-blocks/selection";
import { availableFunnelSources } from "@/lib/funnel-blocks/metrics";
import { isFunnelSourceKey, type FunnelSourceKey } from "@/lib/funnel-blocks/types";

const PERIOD_MONTHS = 3;
// buildMetricCards' pool grew a "show-up-rate" card for Overview's own card
// swap — excluded here so Dashboard's existing grid doesn't silently gain a
// 7th card nobody asked for on this page.
const DASHBOARD_METRIC_CARD_KEYS = [
  "revenue",
  "new-customers",
  "leads",
  "bookings",
  "closing-rate",
  "average-sale",
];

type DashboardPageProps = {
  searchParams: Promise<{ checkin?: string; bandeau?: string; source?: string }>;
};

export default function DashboardPage(props: DashboardPageProps) {
  return measureAsync("page.dashboard", () => renderDashboardPage(props));
}

async function renderDashboardPage({
  searchParams,
}: DashboardPageProps) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("dashboard");
  const tDiagnostic = await getTranslations("diagnostic");
  const tFunnelMetric = await getTranslations("funnelBlocks.metrics");
  const { userId, accountId, user, currentUser } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "dashboard");
  const callTrackingConnected = Boolean(user?.iclosedConnected || user?.calendlyConnected);
  const accountContext = await getAccountContext(userId);
  const hasDestinationPermission = (permission: "acquisition:pipeline" | "ventes:appels" | "ventes:rdv") => {
    if (!accountContext) return false;
    return accountContext.isOwner || accountContext.permissions.has(permission);
  };
  const revenueActionPermissions = {
    pipeline: hasDestinationPermission("acquisition:pipeline"),
    calls: hasDestinationPermission("ventes:appels"),
    booking: hasDestinationPermission("ventes:rdv"),
  };

  // All three only depend on accountId/user.sector, known above — run
  // together instead of as sequential round-trips. getBusinessProfile/
  // getDiagnosticKpiRawData/getDiagnosticBenchmarks are all cache()-wrapped
  // per request, so this is deduped against app/(app)/layout.tsx's own call
  // to the same functions for the Scale Score badge.
  const [businessProfile, { allSettingEntries, allClosingEntries, allMonthlyRows, allCallSourcesByMonth, allSales, allLeads, allLeadStageHistory, allYoutubeVideoInsights, allInstagramPostInsights, allContentPosts, allVideoAttributionTotals, allEmailCampaigns, allMetaMetrics, allNativeBookingLeads }, benchmarks, contentBenchmarks, pipelineBenchmark, weeklyReports, acquisitionCatalog, funnelBlockCatalog] =
    await Promise.all([
      getBusinessProfile(accountId),
      getDiagnosticKpiRawData(accountId),
      getDiagnosticBenchmarks(user?.sector ?? null),
      getContentDiagnosticBenchmarks(user?.sector ?? null),
      getPipelineDiagnosticBenchmark(user?.sector ?? null),
      getRecentWeeklyReports(accountId),
      getAcquisitionFunnelCatalog(),
      getFunnelBlockCatalog(),
    ]);
  const acquisitionSelection = normalizeAcquisitionSelection(businessProfile.acquisition, acquisitionCatalog);
  const funnelBlockSelection = normalizeFunnelBlockSelection(businessProfile.acquisition, funnelBlockCatalog);
  const source: FunnelSourceKey | "total" = isFunnelSourceKey(params.source) ? params.source : "total";
  if (source !== "total") {
    // The client filter also tracks the interaction. This server-side event
    // keeps the event reliable when navigation is interrupted.
    after(() => track("source_filter_used", userId, { source, page: "dashboard" }));
  }
  const acquisitionBenchmarks = await getAcquisitionFunnelBenchmarks(acquisitionSelection.funnels, user?.sector ?? null);
  const funnelBlockBenchmarks = await getFunnelBlockBenchmarks(funnelBlockSelection.blocks.map((item) => item.blockKey), user?.sector ?? null);
  const activeLegacyKeys = activeLegacyMetricKeys(acquisitionSelection, acquisitionCatalog);
  const activeMetricFields = Array.from(
    new Map(
      activeFunnelEntries(acquisitionSelection, acquisitionCatalog)
        .flatMap((entry) => entry.steps)
        .map((stage) => [stage.inputMetricKey, stage] as const)
    ).values()
  );

  // The greeting is personal, so it reads the logged-in person's own row
  // (currentUser), not the account owner's — a team member should be
  // greeted by their own name. Falls back to the email local-part, as before.
  const firstName = currentUser?.displayName?.trim() || currentUser?.email.split("@")[0] || t("there");

  // Technical-alert data — independent of the diagnostic engine above, so
  // fetched as its own batch rather than folded into it. Revenue actions are
  // loaded by their Suspense boundary below and remain a separate projection.
  const [[iclosedConnection], [calendlyConnection]] = await Promise.all([
    user?.iclosedConnected
      ? db.select().from(iclosedConnections).where(eq(iclosedConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
    user?.calendlyConnected
      ? db.select().from(calendlyConnections).where(eq(calendlyConnections.userId, accountId)).limit(1)
      : Promise.resolve([]),
  ]);
  const technicalAlerts = buildTechnicalAlerts({
    keyInvalid: Boolean(user?.anthropicApiKeyInvalid),
    failedSyncs: [
      ...(user?.iclosedConnected && iclosedConnection?.initialSyncStatus === "failed" ? ["iClosed"] : []),
      ...(user?.calendlyConnected && calendlyConnection?.initialSyncStatus === "failed" ? ["Calendly"] : []),
    ],
  });

  const metricCards = buildMetricCards({
    businessProfile,
    allSettingEntries,
    allClosingEntries,
    allMonthlyRows,
    allSales,
    callSourcesByMonth: allCallSourcesByMonth,
    callTrackingConnected,
    isStripeConnected: Boolean(user?.stripeConnectId),
    locale,
  }).filter((card) => DASHBOARD_METRIC_CARD_KEYS.includes(card.key));

  // Same engine and same default period as /diagnostic, so "the goulot
  // actuel" is identical on both pages — see lib/diagnostic/cascade.ts.
  const months = lastCompletedMonths(PERIOD_MONTHS);
  const { settingTotals, closingTotals, cashContractedTotal, hasAnySourceData } = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
    callSourcesByMonth: allCallSourcesByMonth,
    callTrackingConnected,
    allSales,
    allLeads,
    allLeadStageHistory,
    allEmailCampaigns,
    allMetaMetrics,
    allNativeBookingLeads,
  });

  // The visual handoff deliberately says “ce mois” and “/mois”. Keep the
  // existing diagnostic hero on its stable three-completed-month window, and
  // keep the operational/revenue cards on the current month. Content APIs
  // expose per-post totals rather than a monthly series. A latest imported
  // month can be shown on the content page, but it is never used as the
  // funnel denominator when the current month has no visible posts.
  const bottleneckMonth = currentMonthWindow();
  const bottleneckMonths = [bottleneckMonth];
  const {
    settingTotals: bottleneckSettingTotals,
    closingTotals: bottleneckClosingTotals,
    cashContractedTotal: bottleneckCashContractedTotal,
    pipelineTotals: bottleneckPipelineTotals,
    acquisitionTotals: bottleneckAcquisitionTotals,
  } = aggregatePeriodTotals({
    months: bottleneckMonths,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
    callSourcesByMonth: allCallSourcesByMonth,
    callTrackingConnected: Boolean(user?.iclosedConnected || user?.calendlyConnected),
    allSales,
    allLeads,
    allLeadStageHistory,
    allEmailCampaigns,
    allMetaMetrics,
    allNativeBookingLeads,
  });
  const bottleneckMonthlyRow = allMonthlyRows.find(
    (row) => row.year === bottleneckMonth.year && row.month === bottleneckMonth.month
  ) ?? null;
  const availableBlockSources = availableFunnelSources(
    bottleneckMonthlyRow ? [bottleneckMonthlyRow] : [],
    funnelBlockSelection.sources
  );
  const effectiveBlockSource = source !== "total" && availableBlockSources.includes(source) ? source : "total";
  const bottleneckSettingEntries = allSettingEntries.filter((entry) => inRange(entry.date, bottleneckMonth.range));
  const bottleneckClosingEntries = allClosingEntries.filter((entry) => inRange(entry.date, bottleneckMonth.range));
  const bottleneckCallSource = allCallSourcesByMonth[monthKey(bottleneckMonth.year, bottleneckMonth.month)];
  const visibleContentPosts = filterVisibleContentPosts(allContentPosts, allYoutubeVideoInsights);
  const bottleneckContentMonth = resolveContentReportingMonth(visibleContentPosts, bottleneckMonth);
  // A fallback month keeps the content page useful after a sync, but it is
  // not a valid denominator for an in-progress funnel whose other metrics
  // were entered this month. Using it here made June's audience multiply
  // August's VSL clicks/calls/sales and produced fictional six-figure gains.
  const bottleneckContentIsAligned = isSameReportingMonth(bottleneckContentMonth, bottleneckMonth);
  const bottleneckContentMetricMonth = bottleneckContentIsAligned ? bottleneckContentMonth : bottleneckMonth;
  const bottleneckContentMonths = [bottleneckContentMetricMonth];
  const bottleneckContentTotals = aggregateContentTotals(bottleneckContentMonths, visibleContentPosts, allVideoAttributionTotals);
  const bottleneckRetention = computeContentRetentionSummary({
    months: bottleneckContentMonths,
    youtubeVideos: allYoutubeVideoInsights,
    instagramPosts: allInstagramPostInsights,
  });
  const bottleneckPostsInPeriod = visibleContentPosts.filter((post) => inRange(post.publishedAt, bottleneckContentMetricMonth.range)).length;
  const hasBottleneckSettingData =
    bottleneckSettingEntries.length > 0 ||
    [
      bottleneckMonthlyRow?.newFollowers,
      bottleneckMonthlyRow?.firstMessages,
      bottleneckMonthlyRow?.conversations,
      bottleneckMonthlyRow?.callsProposed,
      bottleneckMonthlyRow?.callsBooked,
    ].some((value) => value !== null && value !== undefined) ||
    isMonthlyCallSourceAuthoritative(bottleneckCallSource, callTrackingConnected);
  const hasBottleneckClosingData =
    bottleneckClosingEntries.length > 0 ||
    [bottleneckMonthlyRow?.callsTaken, bottleneckMonthlyRow?.salesClosed].some(
      (value) => value !== null && value !== undefined
    ) ||
    isMonthlyCallSourceAuthoritative(bottleneckCallSource, callTrackingConnected) ||
    allSales.some((sale) => !sale.isOrphan && inRange(sale.saleDate, bottleneckMonth.range));
  const hasBottleneckRevenueData = bottleneckCashContractedTotal > 0 || typeof bottleneckMonthlyRow?.cashContracted === "number";

  const allPoints = hasAnySourceData
    ? computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal, activeMetricKeys: activeLegacyKeys })
    : [];
  const points = allPoints.slice(0, 3);
  const bottleneckPoints = hasBottleneckSettingData || hasBottleneckClosingData || hasBottleneckRevenueData
    ? computeDiagnosticPoints({
        settingTotals: bottleneckSettingTotals,
        closingTotals: bottleneckClosingTotals,
        benchmarks,
        businessProfile,
        cashContractedTotal: bottleneckCashContractedTotal,
        activeMetricKeys: activeLegacyKeys,
      })
    : [];
  const legacyBottleneckFunnel = buildBottleneckFunnel({
    contentTotals: bottleneckContentTotals,
    contentPostsCount: bottleneckPostsInPeriod,
    contentBenchmarks,
    settingTotals: bottleneckSettingTotals,
    closingTotals: bottleneckClosingTotals,
    funnelBenchmarks: benchmarks,
    businessProfile,
    cashContractedTotal: bottleneckCashContractedTotal,
    diagnosticPoints: bottleneckPoints,
    hasSettingData: hasBottleneckSettingData,
    hasClosingData: hasBottleneckClosingData,
    hasRevenueData: hasBottleneckRevenueData,
    retention: bottleneckRetention,
    pipelineTotals: bottleneckPipelineTotals,
    pipelineBenchmarkRate: pipelineBenchmark,
    locale,
  });
  const dealPrice = resolveDealPrice(businessProfile, bottleneckClosingTotals, bottleneckCashContractedTotal);
  const blockMetricValues = buildFunnelBlockMetricValues({
    row: bottleneckMonthlyRow,
    settingTotals: bottleneckSettingTotals,
    closingTotals: bottleneckClosingTotals,
    contentTotals: bottleneckContentTotals,
    acquisitionTotals: bottleneckAcquisitionTotals,
    hasSettingData: hasBottleneckSettingData,
    hasClosingData: hasBottleneckClosingData,
  });
  const assembledBottleneck = buildFunnelBlockBottleneck({
    selection: funnelBlockSelection,
    catalog: funnelBlockCatalog,
    row: bottleneckMonthlyRow,
    benchmarks: funnelBlockBenchmarks,
    metricValues: blockMetricValues,
    source: effectiveBlockSource,
    dealPrice: dealPrice.price,
    revenue: hasBottleneckRevenueData ? bottleneckCashContractedTotal : null,
    sales: hasBottleneckClosingData ? bottleneckClosingTotals.salesClosed : null,
    catalogLabel: t("bottleneckFunnel.title"),
  });
  const localizedAssembledBottleneck = {
    ...assembledBottleneck,
    stages: assembledBottleneck.stages.map((stage) => ({
      ...stage,
      label: stage.metricKey && tFunnelMetric.has(`${stage.metricKey}.label`)
        ? tFunnelMetric(`${stage.metricKey}.label`)
        : stage.label,
      unit: stage.metricKey && tFunnelMetric.has(`${stage.metricKey}.unit`)
        ? tFunnelMetric(`${stage.metricKey}.unit`)
        : stage.unit,
    })),
  };
  const adaptiveVariants: BottleneckFunnelVariant[] = activeFunnelEntries(acquisitionSelection, acquisitionCatalog).map((entry) =>
    buildAdaptiveFunnel({
      entry,
      stageVolumes: buildAcquisitionStageVolumes({
        entry,
        monthlyRow: bottleneckMonthlyRow,
        contentTotals: bottleneckContentTotals,
        contentPostsCount: bottleneckPostsInPeriod,
        settingTotals: bottleneckSettingTotals,
        closingTotals: bottleneckClosingTotals,
        acquisitionTotals: bottleneckAcquisitionTotals,
        hasSettingData: hasBottleneckSettingData,
        hasClosingData: hasBottleneckClosingData,
      }),
      benchmarks: acquisitionBenchmarks,
      dealPrice: dealPrice.price,
      revenue: hasBottleneckRevenueData ? bottleneckCashContractedTotal : null,
    })
  );
  const primaryAdaptiveVariant = adaptiveVariants.find((variant) => variant.catalogKey === acquisitionSelection.primaryFunnel) ?? adaptiveVariants[0];
  const bottleneckFunnel = primaryAdaptiveVariant
    ? {
        ...primaryAdaptiveVariant,
        variants: adaptiveVariants,
        activeFunnelKey: acquisitionSelection.primaryFunnel,
      }
    : legacyBottleneckFunnel;
  const bottleneckLabel = points[0] ? tDiagnostic(`metrics.${points[0].key}`) : t("there");

  const weekRange = currentIsoWeekRange();
  const currentYear = new Date().getUTCFullYear();
  const currentMonth = new Date().getUTCMonth() + 1;
  const currentMonthlyRow = allMonthlyRows.find((row) => row.year === currentYear && row.month === currentMonth);
  const currentCallSource: MonthlyCallSource | null = allCallSourcesByMonth[monthKey(currentYear, currentMonth)] ?? null;
  const currentSalesCount = allSales.filter(
    (sale) => !sale.isOrphan && inRange(sale.saleDate, monthDateRange(currentYear, currentMonth))
  ).length;
  const dailySourceOverlay = resolveDailySourceOverlay(
    monthDateRange(currentYear, currentMonth),
    allSettingEntries,
    allClosingEntries,
    {
      settingManualOverride: currentMonthlyRow?.settingManualOverride,
      closingManualOverride: currentMonthlyRow?.closingManualOverride,
    },
    currentCallSource,
    {
      callTrackingConnected,
      salesClosed: currentSalesCount > 0 ? currentSalesCount : undefined,
    }
  );
  const checkinInitialData = {
    ...(currentMonthlyRow ?? emptyMonthRow(currentYear, currentMonth)),
    ...dailySourceOverlay.overrides,
  };
  const checkInDoneThisWeek =
    allSettingEntries.some((entry) => inRange(entry.date, weekRange)) ||
    allClosingEntries.some((entry) => inRange(entry.date, weekRange)) ||
    currentMonthlyRow !== undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{t("greeting", { name: firstName })}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {points.length > 0
              ? t("bottleneck", { label: bottleneckLabel })
              : t("solidLevers")}
          </p>
        </div>
        <WeeklyReportDialog
          reports={weeklyReports}
          checkInDoneThisWeek={checkInDoneThisWeek}
          checkinYear={currentYear}
          checkinMonth={currentMonth}
          checkinInitialData={checkinInitialData}
          checkinSettingSourced={dailySourceOverlay.settingSourced}
          checkinCallsBookedSourced={dailySourceOverlay.callsBookedSourced}
          checkinClosingSourced={dailySourceOverlay.closingSourced}
          checkinCallSource={currentCallSource}
          checkinActiveMetricFields={activeMetricFields}
        />
      </div>

      {businessProfile.acquisition.funnelSelectionInferred && (
        <AcquisitionFunnelInferredBanner
          title={t("acquisitionFunnelInferred.title")}
          help={t("acquisitionFunnelInferred.help")}
          cta={t("acquisitionFunnelInferred.cta")}
          dismiss={t("acquisitionFunnelInferred.dismiss")}
        />
      )}

      <Suspense fallback={<DashboardLossHeroSkeleton />}>
        <DashboardLossHero
          accountId={accountId}
          businessProfile={businessProfile}
          settingTotals={settingTotals}
          closingTotals={closingTotals}
          cashContractedTotal={cashContractedTotal}
          hasAnyData={hasAnySourceData}
          months={months}
          points={points}
          bottleneckGain={bottleneckFunnel.totalPotential}
          locale={locale}
          bottleneckLabel={bottleneckLabel}
        />
      </Suspense>

      {params.bandeau === "incomplete_data" && (
        <FalcoEmptyState title={t("completeNumbers")} showFalco={false}>
          <p className="text-sm font-bold text-muted-foreground">
            {t("notEnoughData")}
          </p>
        </FalcoEmptyState>
      )}

      <Suspense fallback={<RevenueActionCenterSkeleton />}>
        <RevenueActionCenter accountId={accountId} permissions={revenueActionPermissions} />
      </Suspense>

      <div className="py-4">
        <h2 className="text-base font-bold">{t("monthContext")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("monthContextHelp")}</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metricCards.map((card, index) => (
            <div key={card.key} className="animate-rise" style={{ animationDelay: `${index * 40}ms` }}>
              <MetricCard data={card} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FunnelSourceFilter
          sources={funnelBlockSelection.sources}
          availableSources={availableBlockSources}
          value={effectiveBlockSource}
          sourceHref="/business#acquisition"
          showUnavailableHelp={false}
        />
        <BottleneckFunnel data={localizedAssembledBottleneck} />
      </div>

      <TechnicalAlertsSection alerts={technicalAlerts} />

    </div>
  );
}
