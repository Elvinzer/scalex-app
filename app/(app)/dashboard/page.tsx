import { eq } from "drizzle-orm";
import { Suspense } from "react";

import { CheckinTrigger } from "./checkin-trigger";
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
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeDiagnosticPoints } from "@/lib/diagnostic/cascade";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { currentIsoWeekRange, inRange, buildMetricCards } from "@/lib/dashboard/metrics";
import { buildTechnicalAlerts } from "@/lib/dashboard/technical-alerts";
import { getRecentWeeklyReports } from "@/lib/dashboard/weekly-report";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { emptyMonthRow } from "@/lib/monthly-metrics/queries";
import { resolveDailySourceOverlay } from "@/lib/monthly-metrics/resolve";
import { monthDateRange } from "@/lib/date-range";
import { getAccountContext, requirePermissionOrRedirect } from "@/lib/team/context";

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
  const [businessProfile, { allSettingEntries, allClosingEntries, allMonthlyRows }, benchmarks, weeklyReports] =
    await Promise.all([
      getBusinessProfile(accountId),
      getDiagnosticKpiRawData(accountId),
      getDiagnosticBenchmarks(user?.sector ?? null),
      getRecentWeeklyReports(accountId),
    ]);

  // The greeting is personal, so it reads the logged-in person's own row
  // (currentUser), not the account owner's — a team member should be
  // greeted by their own name. Falls back to the email local-part, as before.
  const firstName = currentUser?.displayName?.trim() || currentUser?.email.split("@")[0] || "là";

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
    isStripeConnected: Boolean(user?.stripeConnectId),
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

  const allPoints = hasAnyMonthlyRow
    ? computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal })
    : [];
  const points = allPoints.slice(0, 3);

  // Top 3 active-but-underperforming levers (toWatch, best-first) — feeds
  // totalMonthlyLoss below (NOT toImplement/absent levers — the hero's
  // "manque à gagner" only counts improvements to something already in
  // place, never a "go set this up" suggestion, that's Découverte's job).
  const { toWatch } = hasAnyMonthlyRow
    ? await computeLeverOpportunities({
        accountId,
        businessProfile,
        settingTotals,
        closingTotals,
        cashContractedTotal,
        periodMonths: PERIOD_MONTHS,
        months,
      })
    : { toWatch: [] };
  const topActiveLevers = [...toWatch].sort((a, b) => b.score - a.score).slice(0, 3);

  // "Manque à gagner" = improvements possible on elements already in place
  // (the cascade bottlenecks + active-but-underperforming levers) — NOT
  // Découverte's absent-lever "possibilities", which never counted toward
  // something concrete existing yet.
  const totalMonthlyLoss = !hasAnyMonthlyRow
    ? null
    : (points.some((p) => p.monthlyGain === null) ? 0 : points.reduce((sum, p) => sum + (p.monthlyGain ?? 0), 0)) +
      topActiveLevers.reduce((sum, w) => sum + (w.impactAmountEur ?? 0), 0);

  // The Dashboard's single content Falco (the floating chat bubble is the
  // one permitted exception). Pose + line reflect the same three states the
  // page already derives — Falco accompanies the figure, never repeats it.
  const heroFalco = !hasAnyMonthlyRow
    ? { pose: "sleeping" as const, line: "Remplis tes chiffres, je tourne à vide." }
    : points.length > 0
      ? { pose: "alert" as const, line: "Ton goulot me coûte du sommeil. On le corrige ?" }
      : { pose: "happy" as const, line: "Tout roule. On vise plus haut ?" };

  const weekRange = currentIsoWeekRange();
  const currentYear = new Date().getUTCFullYear();
  const currentMonth = new Date().getUTCMonth() + 1;
  const currentMonthlyRow = allMonthlyRows.find((row) => row.year === currentYear && row.month === currentMonth);
  const dailySourceOverlay = resolveDailySourceOverlay(
    monthDateRange(currentYear, currentMonth),
    allSettingEntries,
    allClosingEntries
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
          <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Bonjour {firstName}.</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {points.length > 0
              ? `${points[0]?.label ?? "Ton closing"} est le poste qui coûte le plus cher aujourd'hui.`
              : "Tes leviers mesurés sont solides. Voici où accélérer maintenant."}
          </p>
        </div>
        <WeeklyReportDialog
          reports={weeklyReports}
          checkInDoneThisWeek={checkInDoneThisWeek}
          checkinYear={currentYear}
          checkinMonth={currentMonth}
          checkinInitialData={checkinInitialData}
          checkinSettingSourced={dailySourceOverlay.settingSourced}
          checkinClosingSourced={dailySourceOverlay.closingSourced}
        />
      </div>

      <section className="sticker-spotlight animate-rise px-7 py-6" aria-labelledby="dashboard-gap-title">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <p id="dashboard-gap-title" className="text-xs font-bold tracking-[0.08em] text-mist/60 uppercase">Manque à gagner détecté · 30 derniers jours</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="figure-hero">{totalMonthlyLoss === null ? "—" : formatEur(totalMonthlyLoss)}</p>
              <NatureBadge nature="Projection" />
            </div>
            <p className="mt-2 text-sm text-mist/60">Source Stripe + iClosed · calculé sur l&apos;écart au benchmark</p>
          </div>
          <FalcoPageGreet pageKey="dashboard" pose={heroFalco.pose} size="sm" className="hidden lg:flex" />
          <div className="flex flex-wrap gap-2">
            <Button size="lg" asChild>
              <a href="/diagnostic">Voir le diagnostic</a>
            </Button>
            <Button size="lg" variant="outline" className="border-mist/20 bg-transparent text-text-on-dark hover:bg-mist/10 hover:text-text-on-dark" asChild>
              <a href="/diagnostic#calcul">Comment c&apos;est calculé</a>
            </Button>
          </div>
        </div>
        <p className="sr-only">{heroFalco.line}</p>
      </section>

      {params.bandeau === "incomplete_data" && (
        <FalcoEmptyState title="Complète tes chiffres pour ton diagnostic" showFalco={false}>
          <p className="text-sm font-bold text-muted-foreground">
            Pas encore assez de données pour calculer un goulot.
          </p>
        </FalcoEmptyState>
      )}

      <Suspense fallback={<RevenueActionCenterSkeleton />}>
        <RevenueActionCenter accountId={accountId} permissions={revenueActionPermissions} />
      </Suspense>

      <div>
        <h2 className="text-base font-bold">Contexte du mois</h2>
        <p className="mt-1 text-sm text-muted-foreground">Mois en cours, comparé au mois précédent.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metricCards.map((card, index) => (
            <div key={card.key} className="animate-rise" style={{ animationDelay: `${index * 40}ms` }}>
              <MetricCard data={card} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <TechnicalAlertsSection alerts={technicalAlerts} />
        <section className="sticker-card p-4" aria-labelledby="checkin-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="checkin-title" className="text-sm font-bold">Check-in hebdomadaire</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {checkInDoneThisWeek ? "Tes chiffres de la semaine sont déjà enregistrés." : "Deux minutes pour garder le diagnostic à jour."}
              </p>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs font-bold text-muted-foreground">{checkInDoneThisWeek ? "À jour" : "À faire"}</span>
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
              <a href="/dashboard?report=1">Voir le rapport</a>
            </Button>
          </div>
        </section>
      </div>

    </div>
  );
}
