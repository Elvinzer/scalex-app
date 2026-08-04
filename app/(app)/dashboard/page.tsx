import { Suspense } from "react";

import { CheckinTrigger } from "./checkin-trigger";
import { WeeklyReportDialog } from "./weekly-report-dialog";
import { FalcoEmptyState } from "@/components/falco/falco-empty-state";
import { FalcoPageGreet } from "@/components/falco/falco-page-greet";
import { MetricCard } from "@/components/metric-card";
import { PriorityItem } from "@/components/priority-item";
import { Button } from "@/components/ui/button";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeDiagnosticPoints, resolveDealPrice, type DiagnosticPoint } from "@/lib/diagnostic/cascade";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { computePriorityScores, scoreCandidates, type PriorityRecommendation } from "@/lib/diagnostic/priority";
import { getPriorityRules } from "@/lib/diagnostic/priority-rules";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { currentIsoWeekRange, inRange, buildMetricCards } from "@/lib/dashboard/metrics";
import { getRecentWeeklyReports } from "@/lib/dashboard/weekly-report";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { emptyMonthRow } from "@/lib/monthly-metrics/queries";
import { resolveDailySourceOverlay } from "@/lib/monthly-metrics/resolve";
import { monthDateRange } from "@/lib/date-range";
import { requirePermissionOrRedirect } from "@/lib/team/context";

const PERIOD_MONTHS = 3;
// buildMetricCards' pool grew a "show-up-rate" card for Overview's own card
// swap — excluded here so Dashboard's existing grid doesn't silently gain a
// 7th card nobody asked for on this page.
const DASHBOARD_METRIC_CARD_KEYS = [
  "revenue",
  "new-customers",
  "leads",
  "bookings",
  "sales-page-conversion",
  "checkout-visitors",
  "closing-rate",
  "average-sale",
];

// Shared by rank 1 (primaryPick) and ranks 2-3 (fillerRecommendations) —
// same lever-vs-metric branch already used inline before this fix existed.
function renderPriorityRecommendation(rec: PriorityRecommendation, rank: 1 | 2 | 3) {
  return rec.candidate.type === "lever" ? (
    <PriorityItem
      rank={rank}
      leverWinner={{
        leverKey: rec.candidate.key,
        label: rec.candidate.label,
        category: rec.candidate.category,
        monthlyGainEur: rec.candidate.monthlyGainEur,
        isActive: rec.candidate.isActive,
      }}
    />
  ) : (
    // sourceMetricPoint is always set for type "metric" (see
    // collectCandidates in lib/diagnostic/priority.ts).
    <PriorityItem rank={rank} point={rec.candidate.sourceMetricPoint as DiagnosticPoint} />
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkin?: string; bandeau?: string }>;
}) {
  const params = await searchParams;
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "dashboard");

  // All three only depend on accountId/user.sector, known above — run
  // together instead of as sequential round-trips. getBusinessProfile/
  // getDiagnosticKpiRawData/getDiagnosticBenchmarks are all cache()-wrapped
  // per request, so this is deduped against app/(app)/layout.tsx's own call
  // to the same functions for the Scale Score badge.
  const [businessProfile, { allSettingEntries, allClosingEntries, allMonthlyRows }, benchmarks, priorityRules, weeklyReports] =
    await Promise.all([
      getBusinessProfile(accountId),
      getDiagnosticKpiRawData(accountId),
      getDiagnosticBenchmarks(user?.sector ?? null),
      getPriorityRules(),
      getRecentWeeklyReports(accountId),
    ]);

  const firstName = user?.email.split("@")[0] || "là";

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

  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const unlockHints: string[] = [];
  if (!hasAnyMonthlyRow) unlockHints.push("Remplis au moins un mois dans Datas");
  if (dealPrice.price === null) unlockHints.push("Renseigne ton offre principale dans Mon business");

  // Top 3 active-but-underperforming levers (toWatch, best-first) — NOT
  // toImplement (absent levers). "À corriger en priorité" means improving
  // something already in place (mail, conversion rates, etc.), never a
  // "go set this up" suggestion — that's Découverte's job, on /diagnostic.
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

  // Same engine as /diagnostic (lib/diagnostic/priority.ts) so the #1
  // "goulot actuel" agrees between the two pages — only rank 1 is
  // priority-driven; ranks 2-3 stay on the plain €-sort below them
  // (nothing in the brief asks for the whole top-3 to be re-ranked).
  const monthlyRevenueEur = cashContractedTotal / PERIOD_MONTHS;
  // effort defaults to "faible": tuning a lever that's already running is
  // inherently less work than building it from scratch (the question
  // levers_catalog.effort actually answers) — no per-lever "how hard to
  // improve" data exists, so this is a deliberate, documented calibration
  // rather than a real per-lever figure.
  const leverCandidatesForScoring = toWatch.map((watch) => ({
    leverKey: watch.leverKey,
    label: watch.label,
    category: watch.category,
    impactAmountEur: watch.impactAmountEur,
    effort: "faible" as const,
    healthScore: watch.score,
    isActive: true,
  }));
  const { recommendations } = hasAnyMonthlyRow
    ? computePriorityScores({
        points: allPoints,
        leverCandidates: leverCandidatesForScoring,
        businessProfile,
        monthlyRevenueEur,
        rules: priorityRules,
      })
    : { recommendations: [] };
  const topRecommendation = recommendations[0] ?? null;

  // Fallback when nothing clears computePriorityScores' confidence
  // threshold: reuse the SAME unfiltered ranking /diagnostic's "Points à
  // améliorer" shows (scoreCandidates — no threshold, no slice). Without
  // this, a real gap that's lever-only (not one of the 5 cascade metrics,
  // e.g. an underperforming ad campaign) could score under the threshold
  // and this section would render "rien à corriger" while /diagnostic was
  // still showing that exact same lever as something to fix.
  const fullRanked = hasAnyMonthlyRow
    ? scoreCandidates({
        points: allPoints,
        leverCandidates: leverCandidatesForScoring,
        businessProfile,
        monthlyRevenueEur,
        rules: priorityRules,
      })
    : [];
  const primaryPick = topRecommendation ?? fullRanked[0] ?? null;

  // Ranks 2-3 fill in from the plain €-sorted list, skipping whichever
  // metric point rank 1 already covers (a lever-type rank 1 has no
  // equivalent in allPoints, so nothing needs excluding in that case).
  const fillerPoints = allPoints.filter((p) => p.key !== topRecommendation?.candidate.sourceMetricPoint?.key).slice(0, 2);
  // Same idea as fillerPoints, but from the unfiltered ranking (so it can
  // include further levers too) — only used when there's no confident
  // topRecommendation, i.e. primaryPick itself already came from fullRanked.
  const fillerRecommendations = !topRecommendation ? fullRanked.slice(1, 3) : [];

  // "Manque à gagner" = improvements possible on elements already in place
  // (the cascade bottlenecks + active-but-underperforming levers) — NOT
  // Découverte's absent-lever "possibilities", which never counted toward
  // something concrete existing yet.
  const totalMonthlyLoss =
    (points.some((p) => p.monthlyGain === null) ? 0 : points.reduce((sum, p) => sum + (p.monthlyGain ?? 0), 0)) +
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
          <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Salut, {firstName}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {points.length > 0
              ? "Voici où en est ton business, et ce qu'il faut corriger en premier."
              : "Ton business tourne bien. Voici où creuser pour accélérer."}
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

      {/* Bloc 1 — slim single-row hero banner. The benchmark widget is
          pulled off the Dashboard for now (see git history to restore it —
          components/metric-health-carousel.tsx is untouched). */}
      <div className="sticker-spotlight animate-rise flex flex-wrap items-center gap-6 px-7 py-6">
        <FalcoPageGreet pageKey="dashboard" pose={heroFalco.pose} size="sm" className="hidden sm:flex" />
        <div className="flex flex-1 flex-wrap items-baseline gap-x-4 gap-y-1">
          <p className="text-sm font-bold text-mist/70">Manque à gagner détecté</p>
          <p className="figure-hero gradient-text">{formatEur(totalMonthlyLoss)}</p>
          <p className="text-sm text-mist/60">{heroFalco.line}</p>
        </div>
        <Button size="lg" asChild>
          <a href="/diagnostic">Récupérer ce cash →</a>
        </Button>
      </div>

      {params.bandeau === "incomplete_data" && (
        <FalcoEmptyState title="Complète tes chiffres pour ton diagnostic" showFalco={false}>
          <p className="text-sm font-bold text-muted-foreground">
            Pas encore assez de données pour calculer un goulot.
          </p>
        </FalcoEmptyState>
      )}

      {!checkInDoneThisWeek && (
        <div className="sticker-card-dashed flex items-center justify-between gap-4 px-5 py-3">
          <p className="text-sm font-bold">
            📊 2 minutes pour mettre à jour tes chiffres de la semaine
          </p>
          <Suspense fallback={null}>
            <CheckinTrigger
              year={currentYear}
              month={currentMonth}
              initialData={checkinInitialData}
              settingSourced={dailySourceOverlay.settingSourced}
              closingSourced={dailySourceOverlay.closingSourced}
            />
          </Suspense>
        </div>
      )}

      <div>
        <h2 className="text-base font-bold">Tes chiffres clés</h2>
        <p className="mt-1 text-sm text-muted-foreground">Mois en cours, comparé au mois précédent.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {metricCards.map((card, index) => (
            <div key={card.key} className="animate-rise" style={{ animationDelay: `${index * 40}ms` }}>
              <MetricCard data={card} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold">À corriger en priorité</h2>
          <a href="/diagnostic" className="text-sm font-bold text-muted-foreground hover:underline">
            Voir le diagnostic complet →
          </a>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {primaryPick && <div className="animate-rise">{renderPriorityRecommendation(primaryPick, 1)}</div>}

          {topRecommendation
            ? fillerPoints.map((point, index) => (
                <div key={point.key} className="animate-rise" style={{ animationDelay: `${(index + 1) * 60}ms` }}>
                  <PriorityItem rank={(index + 2) as 2 | 3} point={point} />
                </div>
              ))
            : fillerRecommendations.map((rec, index) => (
                <div key={rec.candidate.key} className="animate-rise" style={{ animationDelay: `${(index + 1) * 60}ms` }}>
                  {renderPriorityRecommendation(rec, (index + 2) as 2 | 3)}
                </div>
              ))}

          {points.length < 3 && unlockHints.length > 0 && (
            <FalcoEmptyState title="Débloquer plus de diagnostics" showFalco={false}>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                {unlockHints.map((hint) => (
                  <li key={hint}>• {hint}</li>
                ))}
              </ul>
            </FalcoEmptyState>
          )}

          {/* Genuinely nothing to show — not a "need more data" case
              (unlockHints empty) and no point/lever from the FULL unfiltered
              ranking (fullRanked, same engine as /diagnostic) is below
              benchmark. primaryPick covers both the confident pick and the
              below-threshold fallback, so this can't go stale the way
              checking topRecommendation alone did. */}
          {!primaryPick && unlockHints.length === 0 && (
            <FalcoEmptyState title="Rien à corriger en priorité pour l'instant" showFalco={false}>
              <p className="mt-2 text-sm text-muted-foreground">
                Tous tes taux mesurés sont au niveau du benchmark. Continue comme ça.
              </p>
            </FalcoEmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
