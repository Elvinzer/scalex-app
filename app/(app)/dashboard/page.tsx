import { desc, eq } from "drizzle-orm";
import { Suspense } from "react";

import { CheckinTrigger } from "./checkin-trigger";
import { DailyReportDialog } from "./daily-report-dialog";
import { Falco } from "@/components/falco/falco";
import { FalcoEmptyState } from "@/components/falco/falco-empty-state";
import { MetricCard } from "@/components/metric-card";
import { PriorityItem } from "@/components/priority-item";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeDiagnosticPoints, computeMetricHealthCards, resolveDealPrice } from "@/lib/diagnostic/cascade";
import { MetricHealthCarousel } from "@/components/metric-health-carousel";
import { currentIsoWeekRange, dashboardStripeRange, inRange, buildMetricCards } from "@/lib/dashboard/metrics";
import { getStripeActivity } from "@/lib/dashboard/stripe-metrics";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { emptyMonthRow, getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { resolveDailySourceOverlay } from "@/lib/monthly-metrics/resolve";
import { monthDateRange } from "@/lib/date-range";
import { requirePermissionOrRedirect } from "@/lib/team/context";

const PERIOD_MONTHS = 3;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkin?: string; bandeau?: string }>;
}) {
  const params = await searchParams;
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "dashboard");

  // All four only depend on accountId/user.sector, known above — run together
  // instead of as 4 sequential round-trips.
  const [businessProfile, [allSettingEntries, allClosingEntries, allMonthlyRows], stripeActivity, benchmarks] =
    await Promise.all([
      getBusinessProfile(accountId),
      Promise.all([
        db
          .select()
          .from(settingKpiEntries)
          .where(eq(settingKpiEntries.userId, accountId))
          .orderBy(desc(settingKpiEntries.date)),
        db
          .select()
          .from(closingKpiEntries)
          .where(eq(closingKpiEntries.userId, accountId))
          .orderBy(desc(closingKpiEntries.date)),
        getAllMonthlyMetrics(accountId),
      ]),
      getStripeActivity(accountId, dashboardStripeRange()),
      getDiagnosticBenchmarks(user?.sector ?? null),
    ]);

  const firstName = user?.email.split("@")[0] || "là";

  const metricCards = buildMetricCards({
    businessProfile,
    allSettingEntries,
    allClosingEntries,
    allMonthlyRows,
    stripeActivity,
  });

  // Same engine and same default period as /diagnostic, so "the goulot
  // actuel" is identical on both pages — see lib/diagnostic/cascade.ts.
  const months = lastCompletedMonths(PERIOD_MONTHS);
  const { settingTotals, closingTotals, cashContractedTotal, hasAnyMonthlyRow } = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
  });

  const points = hasAnyMonthlyRow
    ? computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal }).slice(0, 3)
    : [];

  // Same inputs as `points` above — no extra query, nothing persisted, so
  // this stays in sync with every existing revalidatePath("/dashboard") call
  // (save Datas, save Mon business).
  const healthCards = hasAnyMonthlyRow
    ? computeMetricHealthCards({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal })
    : [];
  const auditUrl = process.env.NEXT_PUBLIC_APP_URL || "scalex.app";

  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const unlockHints: string[] = [];
  if (!hasAnyMonthlyRow) unlockHints.push("Remplis au moins un mois dans Datas");
  if (dealPrice.price === null) unlockHints.push("Renseigne ton offre principale dans Mon business");

  const totalMonthlyLoss = points.some((p) => p.monthlyGain === null)
    ? 0
    : points.reduce((sum, p) => sum + (p.monthlyGain ?? 0), 0);

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
          <p className="mt-1.5 text-sm font-bold text-muted-foreground">
            {points.length > 0
              ? "Voici où en est ton business, et ce qu'il faut corriger en premier."
              : "Ton business tourne bien. Voici où creuser pour accélérer."}
          </p>
        </div>
        <DailyReportDialog />
      </div>

      {/* Bloc 1 — hero and benchmark widget share one row (grid) instead of
          each spanning full width, so neither dominates the screen (see
          plan doc re: no execution engine exists yet to attribute real
          recovered/generated value to). The carousel's cards are shrunk via
          CSS transform (see metric-health-carousel.tsx's DISPLAY_WIDTH_PX)
          to actually fit next to the hero at a reasonable width. */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="sticker-spotlight animate-rise flex flex-wrap items-center gap-4 px-6 py-4">
          <Falco pose={heroFalco.pose} size="xs" animate="enter" className="hidden sm:flex" />
          <div className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <p className="text-xs font-bold text-mist/70">Manque à gagner détecté</p>
            <p className="gradient-text text-2xl font-bold tracking-[-0.01em] tabular-nums">
              {formatEur(totalMonthlyLoss)}
            </p>
            <p className="text-xs text-mist/60">{heroFalco.line}</p>
          </div>
          <Button size="sm" asChild>
            <a href="/diagnostic">Récupérer ce cash →</a>
          </Button>
        </div>

        <div>
          <h2 className="text-base font-bold">Tes métriques vs le benchmark</h2>
          {healthCards.length < 2 ? (
            <FalcoEmptyState title="Complète tes chiffres pour débloquer tes cartes" className="mt-3" showFalco={false}>
              <a href="/datas" className="mt-2 inline-block text-sm font-bold text-muted-foreground hover:underline">
                Aller dans Datas →
              </a>
            </FalcoEmptyState>
          ) : (
            <div className="mt-3">
              <MetricHealthCarousel cards={healthCards} auditUrl={auditUrl} />
            </div>
          )}
        </div>
      </div>

      {params.bandeau === "incomplete_data" && (
        <FalcoEmptyState title="Complète tes chiffres pour ton diagnostic" showFalco={false}>
          <p className="text-sm font-bold text-muted-foreground">
            Pas encore assez de données pour calculer un goulot.
          </p>
        </FalcoEmptyState>
      )}

      {!checkInDoneThisWeek && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-border bg-card/50 px-5 py-3">
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
        <p className="mt-1 text-sm font-bold text-muted-foreground">
          Mois en cours, comparé au mois précédent.
        </p>
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
          {points.map((point, index) => (
            <div key={point.key} className="animate-rise" style={{ animationDelay: `${index * 60}ms` }}>
              <PriorityItem rank={(index + 1) as 1 | 2 | 3} point={point} />
            </div>
          ))}

          {points.length < 3 && unlockHints.length > 0 && (
            <FalcoEmptyState title="Débloquer plus de diagnostics" showFalco={false}>
              <ul className="mt-2 flex flex-col gap-1 text-sm font-bold text-muted-foreground">
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
