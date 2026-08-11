import { eq } from "drizzle-orm";
import { Suspense } from "react";

import { BottleneckFunnel } from "./bottleneck-funnel";
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
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { buildBottleneckFunnel } from "@/lib/dashboard/bottleneck";
import type { BottleneckFunnelVariant } from "@/lib/dashboard/bottleneck";
import { buildAdaptiveFunnel } from "@/lib/acquisition-funnels/metrics";
import { getAcquisitionFunnelBenchmarks, getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { activeFunnelEntries, activeLegacyMetricKeys, normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import type { AcquisitionFunnelCatalogEntry } from "@/lib/acquisition-funnels/types";
import { currentIsoWeekRange, inRange, buildMetricCards } from "@/lib/dashboard/metrics";
import { buildTechnicalAlerts } from "@/lib/dashboard/technical-alerts";
import { getRecentWeeklyReports } from "@/lib/dashboard/weekly-report";
import { getCurrentUser } from "@/lib/current-user";
import { isMonthlyCallSourceAvailable, monthKey, type MonthlyCallSource } from "@/lib/monthly-metrics/call-source";
import { emptyMonthRow } from "@/lib/monthly-metrics/queries";
import { resolveDailySourceOverlay } from "@/lib/monthly-metrics/resolve";
import { monthDateRange } from "@/lib/date-range";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";
import { measureAsync } from "@/lib/perf/timing";
import { getLocale, getTranslations } from "next-intl/server";
import type { AcquisitionSourceTotals } from "@/lib/diagnostic/acquisition-sources";
import type { ContentTotals } from "@/lib/diagnostic/content-metrics";
import type { ClosingTotals } from "@/lib/closing/metrics";
import type { FunnelTotals } from "@/lib/setting/funnel";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";

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
  searchParams: Promise<{ checkin?: string; bandeau?: string }>;
};

function adaptiveStageVolumes({
  entry,
  monthlyRow,
  contentTotals,
  contentPostsCount,
  settingTotals,
  closingTotals,
  acquisitionTotals,
  hasSettingData,
  hasClosingData,
  hasRevenueData,
}: {
  entry: AcquisitionFunnelCatalogEntry;
  monthlyRow: MonthlyMetricsRow | null;
  contentTotals: ContentTotals;
  contentPostsCount: number;
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  acquisitionTotals: AcquisitionSourceTotals;
  hasSettingData: boolean;
  hasClosingData: boolean;
  hasRevenueData: boolean;
}): Record<string, number | null> {
  const values: Record<string, number | null> = {
    content_views: contentPostsCount > 0 ? contentTotals.views : null,
    content_clicks: contentPostsCount > 0 ? contentTotals.clicks : null,
    content_leads: contentPostsCount > 0 ? contentTotals.leads : null,
    // A content post view is not a VSL view. Keep this step unmeasured until
    // the user/import supplies the VSL-specific count instead of reusing an
    // unrelated source and creating a false conversion rate.
    vsl_views: null,
    new_followers: hasSettingData ? settingTotals.newSubscribers : null,
    first_messages: hasSettingData ? settingTotals.firstMessagesSent : null,
    conversations: hasSettingData ? settingTotals.conversationsStarted : null,
    calls_proposed: hasSettingData ? settingTotals.callsProposed : null,
    calls_booked: hasSettingData ? settingTotals.callsBooked : null,
    calls_attended: hasClosingData ? closingTotals.callsAttended : null,
    sales_closed: hasClosingData ? closingTotals.salesClosed : null,
    newsletter_subscribers: acquisitionTotals.email.sends > 0 ? acquisitionTotals.email.sends : null,
    newsletter_opens: acquisitionTotals.email.opens > 0 ? acquisitionTotals.email.opens : null,
    newsletter_offer_clicks: acquisitionTotals.email.clicks > 0 ? acquisitionTotals.email.clicks : null,
  };

  for (const step of entry.steps) {
    const customValue = monthlyRow?.acquisitionMetrics?.[step.inputMetricKey];
    if (typeof customValue === "number") values[step.inputMetricKey] = customValue;
    else if (values[step.inputMetricKey] === undefined) values[step.inputMetricKey] = null;
  }

  // The first stage is useful even before a user has manually entered a
  // revenue figure. `hasRevenueData` is intentionally read here so the
  // generic builder can keep the same no-false-gain guard as the legacy one.
  if (!hasRevenueData) values.sales_closed = values.sales_closed ?? null;
  return values;
}

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
  const { userId, accountId, user, currentUser } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "dashboard");
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
  const [businessProfile, { allSettingEntries, allClosingEntries, allMonthlyRows, allCallSourcesByMonth, allSales, allLeads, allLeadStageHistory, allYoutubeVideoInsights, allInstagramPostInsights, allContentPosts, allVideoAttributionTotals, allEmailCampaigns, allMetaMetrics, allNativeBookingLeads }, benchmarks, contentBenchmarks, pipelineBenchmark, weeklyReports, acquisitionCatalog] =
    await Promise.all([
      getBusinessProfile(accountId),
      getDiagnosticKpiRawData(accountId),
      getDiagnosticBenchmarks(user?.sector ?? null),
      getContentDiagnosticBenchmarks(user?.sector ?? null),
      getPipelineDiagnosticBenchmark(user?.sector ?? null),
      getRecentWeeklyReports(accountId),
      getAcquisitionFunnelCatalog(),
    ]);
  const acquisitionSelection = normalizeAcquisitionSelection(businessProfile.acquisition, acquisitionCatalog);
  const acquisitionBenchmarks = await getAcquisitionFunnelBenchmarks(acquisitionSelection.funnels, user?.sector ?? null);
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
    allSales,
    allLeads,
    allLeadStageHistory,
    allEmailCampaigns,
    allMetaMetrics,
    allNativeBookingLeads,
  });

  // The visual handoff deliberately says “ce mois” and “/mois”. Keep the
  // existing diagnostic hero on its stable three-completed-month window, but
  // feed this visual with the current month so its labels and values describe
  // the same period as the reference design.
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
  const bottleneckSettingEntries = allSettingEntries.filter((entry) => inRange(entry.date, bottleneckMonth.range));
  const bottleneckClosingEntries = allClosingEntries.filter((entry) => inRange(entry.date, bottleneckMonth.range));
  const bottleneckCallSource = allCallSourcesByMonth[monthKey(bottleneckMonth.year, bottleneckMonth.month)];
  const visibleContentPosts = filterVisibleContentPosts(allContentPosts, allYoutubeVideoInsights);
  const bottleneckContentTotals = aggregateContentTotals(bottleneckMonths, visibleContentPosts, allVideoAttributionTotals);
  const bottleneckRetention = computeContentRetentionSummary({
    months: bottleneckMonths,
    youtubeVideos: allYoutubeVideoInsights,
    instagramPosts: allInstagramPostInsights,
  });
  const bottleneckPostsInPeriod = visibleContentPosts.filter((post) => inRange(post.publishedAt, bottleneckMonth.range)).length;
  const hasBottleneckSettingData =
    bottleneckSettingEntries.length > 0 ||
    [
      bottleneckMonthlyRow?.newFollowers,
      bottleneckMonthlyRow?.firstMessages,
      bottleneckMonthlyRow?.conversations,
      bottleneckMonthlyRow?.callsProposed,
      bottleneckMonthlyRow?.callsBooked,
    ].some((value) => value !== null && value !== undefined) ||
    isMonthlyCallSourceAvailable(bottleneckCallSource);
  const hasBottleneckClosingData =
    bottleneckClosingEntries.length > 0 ||
    [bottleneckMonthlyRow?.callsTaken, bottleneckMonthlyRow?.salesClosed].some(
      (value) => value !== null && value !== undefined
    ) ||
    isMonthlyCallSourceAvailable(bottleneckCallSource) ||
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
  const adaptiveVariants: BottleneckFunnelVariant[] = activeFunnelEntries(acquisitionSelection, acquisitionCatalog).map((entry) =>
    buildAdaptiveFunnel({
      entry,
      stageVolumes: adaptiveStageVolumes({
        entry,
        monthlyRow: bottleneckMonthlyRow,
        contentTotals: bottleneckContentTotals,
        contentPostsCount: bottleneckPostsInPeriod,
        settingTotals: bottleneckSettingTotals,
        closingTotals: bottleneckClosingTotals,
        acquisitionTotals: bottleneckAcquisitionTotals,
        hasSettingData: hasBottleneckSettingData,
        hasClosingData: hasBottleneckClosingData,
        hasRevenueData: hasBottleneckRevenueData,
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
  const dailySourceOverlay = resolveDailySourceOverlay(
    monthDateRange(currentYear, currentMonth),
    allSettingEntries,
    allClosingEntries,
    {
      settingManualOverride: currentMonthlyRow?.settingManualOverride,
      closingManualOverride: currentMonthlyRow?.closingManualOverride,
    },
    currentCallSource
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

      <div>
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

      <BottleneckFunnel data={bottleneckFunnel} />

      <TechnicalAlertsSection alerts={technicalAlerts} />

    </div>
  );
}
