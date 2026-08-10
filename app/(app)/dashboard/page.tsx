import { eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";

import { CheckinTrigger } from "./checkin-trigger";
import { BottleneckFunnel } from "./bottleneck-funnel";
import { RevenueActionCenter, RevenueActionCenterSkeleton } from "./revenue-action-center";
import { TechnicalAlertsSection } from "./technical-alerts-section";
import { WeeklyReportDialog } from "./weekly-report-dialog";
import { FalcoEmptyState } from "@/components/falco/falco-empty-state";
import { FalcoPageGreet } from "@/components/falco/falco-page-greet";
import { MetricCard } from "@/components/metric-card";
import { NatureBadge } from "@/components/nature-badge";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { calendlyConnections, iclosedConnections } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { currentMonthWindow, lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { getContentDiagnosticBenchmarks } from "@/lib/diagnostic/content-benchmarks";
import { aggregateContentTotals } from "@/lib/diagnostic/content-metrics";
import { sumChiffrableMonthlyGains } from "@/lib/diagnostic/monthly-gap";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { getContentPosts } from "@/lib/content-posts/queries";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { buildBottleneckFunnel } from "@/lib/dashboard/bottleneck";
import { currentIsoWeekRange, inRange, buildMetricCards } from "@/lib/dashboard/metrics";
import { buildTechnicalAlerts } from "@/lib/dashboard/technical-alerts";
import { getRecentWeeklyReports } from "@/lib/dashboard/weekly-report";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { monthKey, type MonthlyCallSource } from "@/lib/monthly-metrics/call-source";
import { emptyMonthRow } from "@/lib/monthly-metrics/queries";
import { resolveDailySourceOverlay } from "@/lib/monthly-metrics/resolve";
import { monthDateRange } from "@/lib/date-range";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkin?: string; bandeau?: string }>;
}) {
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
  const [businessProfile, { allSettingEntries, allClosingEntries, allMonthlyRows, allCallSourcesByMonth }, benchmarks, contentBenchmarks, allContentPosts, weeklyReports] =
    await Promise.all([
      getBusinessProfile(accountId),
      getDiagnosticKpiRawData(accountId),
      getDiagnosticBenchmarks(user?.sector ?? null),
      getContentDiagnosticBenchmarks(user?.sector ?? null),
      getContentPosts(accountId),
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
    callSourcesByMonth: allCallSourcesByMonth,
    isStripeConnected: Boolean(user?.stripeConnectId),
    locale,
  }).filter((card) => DASHBOARD_METRIC_CARD_KEYS.includes(card.key));

  // Same engine and same default period as /diagnostic, so "the goulot
  // actuel" is identical on both pages — see lib/diagnostic/cascade.ts.
  const months = lastCompletedMonths(PERIOD_MONTHS);
  const { settingTotals, closingTotals, cashContractedTotal, hasAnyMonthlyRow } = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
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
  } = aggregatePeriodTotals({
    months: bottleneckMonths,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
  });
  const bottleneckMonthlyRow = allMonthlyRows.find(
    (row) => row.year === bottleneckMonth.year && row.month === bottleneckMonth.month
  );
  const bottleneckSettingEntries = allSettingEntries.filter((entry) => inRange(entry.date, bottleneckMonth.range));
  const bottleneckClosingEntries = allClosingEntries.filter((entry) => inRange(entry.date, bottleneckMonth.range));
  const bottleneckCallSource = allCallSourcesByMonth[monthKey(bottleneckMonth.year, bottleneckMonth.month)];
  const bottleneckContentTotals = aggregateContentTotals(bottleneckMonths, allContentPosts);
  const bottleneckPostsInPeriod = allContentPosts.filter((post) => inRange(post.publishedAt, bottleneckMonth.range)).length;
  const hasBottleneckSettingData =
    bottleneckSettingEntries.length > 0 ||
    [
      bottleneckMonthlyRow?.newFollowers,
      bottleneckMonthlyRow?.firstMessages,
      bottleneckMonthlyRow?.conversations,
      bottleneckMonthlyRow?.callsProposed,
      bottleneckMonthlyRow?.callsBooked,
    ].some((value) => value !== null && value !== undefined) ||
    bottleneckCallSource !== undefined;
  const hasBottleneckClosingData =
    bottleneckClosingEntries.length > 0 ||
    [bottleneckMonthlyRow?.callsTaken, bottleneckMonthlyRow?.salesClosed].some(
      (value) => value !== null && value !== undefined
    ) ||
    bottleneckCallSource !== undefined;
  const hasBottleneckRevenueData = typeof bottleneckMonthlyRow?.cashContracted === "number";

  const allPoints = hasAnyMonthlyRow
    ? computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal })
    : [];
  const points = allPoints.slice(0, 3);
  const bottleneckPoints = hasBottleneckSettingData || hasBottleneckClosingData
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
    locale,
  });
  const bottleneckLabel = points[0] ? tDiagnostic(`metrics.${points[0].key}`) : t("there");

  // Active-but-underperforming levers and explicit improvements still to
  // implement both contribute to the user's recoverable monthly potential.
  const { toImplement, toWatch } = hasAnyMonthlyRow
    ? await computeLeverOpportunities({
        accountId,
        businessProfile,
        settingTotals,
        closingTotals,
        cashContractedTotal,
        periodMonths: PERIOD_MONTHS,
        months,
      })
    : { toImplement: [], toWatch: [] };
  const topActiveLevers = [...toWatch].sort((a, b) => b.score - a.score).slice(0, 3);

  // "Manque à gagner" = all currently chiffrable opportunities: the three
  // weakest cascade points, the three weakest active levers, and explicit
  // improvements still to implement. Null amounts stay out until their
  // missing inputs are available.
  const totalMonthlyLoss = !hasAnyMonthlyRow
    ? null
    : sumChiffrableMonthlyGains([
        ...points.map((point) => point.monthlyGain),
        ...topActiveLevers.map((lever) => lever.impactAmountEur),
        ...toImplement.map((lever) => lever.impactAmountEur),
      ]);

  // The Dashboard's single content Falco (the floating chat bubble is the
  // one permitted exception). Pose + line reflect the same three states the
  // page already derives — Falco accompanies the figure, never repeats it.
  const heroFalco = !hasAnyMonthlyRow
    ? { pose: "sleeping" as const, line: t("completeNumbers") }
    : points.length > 0
      ? { pose: "alert" as const, line: t("bottleneck", { label: bottleneckLabel }) }
      : { pose: "happy" as const, line: t("solidLevers") };

  const weekRange = currentIsoWeekRange();
  const currentYear = new Date().getUTCFullYear();
  const currentMonth = new Date().getUTCMonth() + 1;
  const currentMonthlyRow = allMonthlyRows.find((row) => row.year === currentYear && row.month === currentMonth);
  const currentCallSource: MonthlyCallSource | null = currentMonthlyRow?.closingManualOverride
    ? null
    : allCallSourcesByMonth[monthKey(currentYear, currentMonth)] ?? null;
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

      <section className="sticker-spotlight animate-rise px-7 py-6" aria-labelledby="dashboard-gap-title">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p id="dashboard-gap-title" className="text-xs font-bold tracking-[0.08em] text-mist/60 uppercase">{t("lossDetected")}</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="figure-hero">{totalMonthlyLoss === null ? "—" : formatEur(totalMonthlyLoss, locale)}</p>
              <NatureBadge nature="Projection" />
            </div>
            <p className="mt-2 text-sm text-mist/60">{t("source")}</p>
          </div>
          <FalcoPageGreet pageKey="dashboard" pose={heroFalco.pose} size="sm" className="hidden lg:flex" />
          <div className="flex flex-wrap gap-2">
            <Button size="lg" asChild>
              <Link href="/diagnostic" prefetch={true}>{t("viewDiagnostic")}</Link>
            </Button>
            <Button size="lg" variant="outline" className="border-mist/20 bg-transparent text-text-on-dark hover:bg-mist/10 hover:text-text-on-dark" asChild>
              <Link href="/diagnostic#calcul" prefetch={true}>{t("howCalculated")}</Link>
            </Button>
          </div>
        </div>
        <p className="sr-only">{heroFalco.line}</p>
      </section>

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
