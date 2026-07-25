import { Suspense } from "react";

import { CheckinTrigger } from "./checkin-trigger";
import { DailyReportDialog } from "./daily-report-dialog";
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
import { computePriorityScores } from "@/lib/diagnostic/priority";
import { getPriorityRules } from "@/lib/diagnostic/priority-rules";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { currentIsoWeekRange, inRange, buildMetricCards } from "@/lib/dashboard/metrics";
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
  const [businessProfile, { allSettingEntries, allClosingEntries, allMonthlyRows }, benchmarks, priorityRules] = await Promise.all([
    getBusinessProfile(accountId),
    getDiagnosticKpiRawData(accountId),
    getDiagnosticBenchmarks(user?.sector ?? null),
    getPriorityRules(),
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
      })
    : { toWatch: [] };
  const topActiveLevers = [...toWatch].sort((a, b) => b.score - a.score).slice(0, 3);

  // Same engine as /diagnostic (lib/diagnostic/priority.ts) so the #1
  // "goulot actuel" agrees between the two pages — only rank 1 is
  // priority-driven; ranks 2-3 stay on the plain €-sort below them
  // (nothing in the brief asks for the whole top-3 to be re-ranked).
  const monthlyRevenueEur = cashContractedTotal / PERIOD_MONTHS;
  const { recommendations } = hasAnyMonthlyRow
    ? computePriorityScores({
        points: allPoints,
        // effort defaults to "faible": tuning a lever that's already running
        // is inherently less work than building it from scratch (the
        // question levers_catalog.effort actually answers) — no per-lever
        // "how hard to improve" data exists, so this is a deliberate,
        // documented calibration rather than a real per-lever figure.
        leverCandidates: toWatch.map((watch) => ({
          leverKey: watch.leverKey,
          label: watch.label,
          category: watch.category,
          impactAmountEur: watch.impactAmountEur,
          effort: "faible" as const,
          healthScore: watch.score,
          isActive: true,
        })),
        businessProfile,
        monthlyRevenueEur,
        rules: priorityRules,
      })
    : { recommendations: [] };
  const topRecommendation = recommendations[0] ?? null;

  // Ranks 2-3 fill in from the plain €-sorted list, skipping whichever
  // metric point rank 1 already covers (a lever-type rank 1 has no
  // equivalent in allPoints, so nothing needs excluding in that case).
  const fillerPoints = allPoints
    .filter((p) => p.key !== topRecommendation?.candidate.sourceMetricPoint?.key)
    .slice(0, topRecommendation ? 2 : 3);

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

  const todayIso = new Date().toISOString().slice(0, 10);
  const dailyReportDoneToday =
    allSettingEntries.some((entry) => entry.date === todayIso) || allClosingEntries.some((entry) => entry.date === todayIso);

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
        <DailyReportDialog alreadyDoneToday={dailyReportDoneToday} />
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
          {topRecommendation ? (
            <div className="animate-rise">
              {topRecommendation.candidate.type === "lever" ? (
                <PriorityItem
                  rank={1}
                  leverWinner={{
                    leverKey: topRecommendation.candidate.key,
                    label: topRecommendation.candidate.label,
                    category: topRecommendation.candidate.category,
                    monthlyGainEur: topRecommendation.candidate.monthlyGainEur,
                    isActive: topRecommendation.candidate.isActive,
                  }}
                />
              ) : (
                // sourceMetricPoint is always set for type "metric" (see
                // collectCandidates in lib/diagnostic/priority.ts).
                <PriorityItem rank={1} point={topRecommendation.candidate.sourceMetricPoint as DiagnosticPoint} />
              )}
            </div>
          ) : (
            points[0] && (
              <div className="animate-rise">
                <PriorityItem rank={1} point={points[0]} />
              </div>
            )
          )}

          {(topRecommendation ? fillerPoints : points.slice(1)).map((point, index) => (
            <div key={point.key} className="animate-rise" style={{ animationDelay: `${(index + 1) * 60}ms` }}>
              <PriorityItem rank={(index + 2) as 2 | 3} point={point} />
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
        </div>
      </div>
    </div>
  );
}
