import { eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";

import { CheckinTrigger } from "./checkin-trigger";
import { BottleneckFunnel } from "./bottleneck-funnel";
import { DashboardLossHero, DashboardLossHeroSkeleton } from "./dashboard-loss-hero";
import { RevenueActionCenter, RevenueActionCenterSkeleton } from "./revenue-action-center";
import { TechnicalAlertsSection } from "./technical-alerts-section";
import { WeeklyReportDialog } from "./weekly-report-dialog";
import { FalcoEmptyState } from "@/components/falco/falco-empty-state";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { calendlyConnections, iclosedConnections } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { currentMonthWindow, lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { getContentDiagnosticBenchmarks } from "@/lib/diagnostic/content-benchmarks";
import { getPipelineDiagnosticBenchmark } from "@/lib/diagnostic/pipeline-metrics";
import { computeContentRetentionSummary } from "@/lib/diagnostic/content-retention";
import { aggregateContentTotals } from "@/lib/diagnostic/content-metrics";
import { filterVisibleContentPosts } from "@/lib/content-posts/visibility";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { buildBottleneckFunnel } from "@/lib/dashboard/bottleneck";
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
  const [businessProfile, { allSettingEntries, allClosingEntries, allMonthlyRows, allCallSourcesByMonth, allSales, allLeads, allLeadStageHistory, allYoutubeVideoInsights, allInstagramPostInsights, allContentPosts, allVideoAttributionTotals, allEmailCampaigns, allMetaMetrics, allNativeBookingLeads }, benchmarks, contentBenchmarks, pipelineBenchmark, weeklyReports] =
    await Promise.all([
      getBusinessProfile(accountId),
      getDiagnosticKpiRawData(accountId),
      getDiagnosticBenchmarks(user?.sector ?? null),
      getContentDiagnosticBenchmarks(user?.sector ?? null),
      getPipelineDiagnosticBenchmark(user?.sector ?? null),
      getRecentWeeklyReports(accountId),
    ]);

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
  );
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
    ? computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal })
    : [];
  const points = allPoints.slice(0, 3);
  const bottleneckPoints = hasBottleneckSettingData || hasBottleneckClosingData || hasBottleneckRevenueData
    ? computeDiagnosticPoints({
        settingTotals: bottleneckSettingTotals,
        closingTotals: bottleneckClosingTotals,
        benchmarks,
        businessProfile,
        cashContractedTotal: bottleneckCashContractedTotal,
      })
    : [];
  const bottleneckFunnel = buildBottleneckFunnel({
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
        />
      </div>

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

      <div className="grid gap-3 lg:grid-cols-2">
        <TechnicalAlertsSection alerts={technicalAlerts} />
        <section className="sticker-card p-4" aria-labelledby="checkin-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="checkin-title" className="text-sm font-bold">{t("weeklyCheckin")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {checkInDoneThisWeek ? t("weekRecorded") : t("weekNotRecorded")}
              </p>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">{checkInDoneThisWeek ? t("upToDate") : t("toDo")}</span>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Suspense fallback={null}>
              <CheckinTrigger
                year={currentYear}
                month={currentMonth}
                initialData={checkinInitialData}
                settingSourced={dailySourceOverlay.settingSourced}
                closingSourced={dailySourceOverlay.closingSourced}
              />
            </Suspense>
            <Button type="button" variant="link" asChild>
              <Link href="/dashboard?report=1" prefetch={true}>{t("viewReport")}</Link>
            </Button>
          </div>
        </section>
      </div>

    </div>
  );
}
