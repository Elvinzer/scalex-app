import { desc, eq } from "drizzle-orm";
import { Suspense } from "react";

import { CheckinTrigger } from "./checkin-trigger";
import { MetricCard } from "@/components/metric-card";
import { PriorityItem } from "@/components/priority-item";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeDiagnosticPoints, resolveDealPrice } from "@/lib/diagnostic/cascade";
import { currentIsoWeekRange, dashboardStripeRange, inRange, buildMetricCards } from "@/lib/dashboard/metrics";
import { getStripeActivity } from "@/lib/dashboard/stripe-metrics";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { emptyMonthRow, getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";

const PERIOD_MONTHS = 3;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkin?: string; bandeau?: string }>;
}) {
  const params = await searchParams;
  const { userId, user } = await getCurrentUser();

  // All four only depend on userId/user.sector, known above — run together
  // instead of as 4 sequential round-trips.
  const [businessProfile, [allSettingEntries, allClosingEntries, allMonthlyRows], stripeActivity, benchmarks] =
    await Promise.all([
      getBusinessProfile(userId),
      Promise.all([
        db
          .select()
          .from(settingKpiEntries)
          .where(eq(settingKpiEntries.userId, userId))
          .orderBy(desc(settingKpiEntries.date)),
        db
          .select()
          .from(closingKpiEntries)
          .where(eq(closingKpiEntries.userId, userId))
          .orderBy(desc(closingKpiEntries.date)),
        getAllMonthlyMetrics(userId),
      ]),
      getStripeActivity(userId, dashboardStripeRange()),
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

  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const unlockHints: string[] = [];
  if (!hasAnyMonthlyRow) unlockHints.push("Remplis au moins un mois dans Datas");
  if (dealPrice.price === null) unlockHints.push("Renseigne ton offre principale dans Mon business");

  const totalMonthlyLoss = points.some((p) => p.monthlyGain === null)
    ? 0
    : points.reduce((sum, p) => sum + (p.monthlyGain ?? 0), 0);

  const weekRange = currentIsoWeekRange();
  const currentYear = new Date().getUTCFullYear();
  const currentMonth = new Date().getUTCMonth() + 1;
  const currentMonthlyRow = allMonthlyRows.find((row) => row.year === currentYear && row.month === currentMonth);
  const checkinInitialData = currentMonthlyRow ?? emptyMonthRow(currentYear, currentMonth);
  const checkInDoneThisWeek =
    allSettingEntries.some((entry) => inRange(entry.date, weekRange)) ||
    allClosingEntries.some((entry) => inRange(entry.date, weekRange)) ||
    currentMonthlyRow !== undefined;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-[22px] leading-[1.2] font-medium tracking-[-0.01em]">Salut, {firstName}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {points.length > 0
            ? "Voici où en est ton business, et ce qu'il faut corriger en premier."
            : "Ton business tourne bien. Voici où creuser pour accélérer."}
        </p>
      </div>

      {/* Bloc 1 — always the honest empty-state: no execution engine exists
          yet to attribute real recovered/generated value to (see plan doc). */}
      <div className="sticker-spotlight animate-rise px-7 py-6">
        <p className="text-xs text-mist/70">Manque à gagner détecté</p>
        <p className="gradient-text mt-2 text-[38px] leading-[1.1] font-medium tracking-[-0.02em] tabular-nums">
          {formatEur(totalMonthlyLoss)}
        </p>
        <p className="mt-2 text-sm text-mist/70">
          {points.length > 0
            ? `sur ${points.length} goulot${points.length > 1 ? "s" : ""} identifié${points.length > 1 ? "s" : ""}`
            : "renseigne ton offre et tes chiffres pour le chiffrer"}
        </p>
        <Button size="lg" asChild className="mt-6">
          <a href="/agent">Récupérer ce cash →</a>
        </Button>
      </div>

      {params.bandeau === "incomplete_data" && (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 px-5 py-3">
          <p className="text-sm font-medium">
            📋 Complète tes chiffres pour ton diagnostic — pas encore assez de données pour calculer un goulot.
          </p>
        </div>
      )}

      {!checkInDoneThisWeek && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-dashed border-border bg-card/50 px-5 py-3">
          <p className="text-sm font-medium">
            📊 2 minutes pour mettre à jour tes chiffres de la semaine
          </p>
          <Suspense fallback={null}>
            <CheckinTrigger year={currentYear} month={currentMonth} initialData={checkinInitialData} />
          </Suspense>
        </div>
      )}

      <div>
        <h2 className="text-base font-medium">Tes chiffres clés</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mois en cours, comparé au mois précédent.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metricCards.map((card, index) => (
            <div key={card.key} className="animate-rise" style={{ animationDelay: `${index * 40}ms` }}>
              <MetricCard data={card} />
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">À corriger en priorité</h2>
          <a href="/diagnostic" className="text-sm font-medium text-muted-foreground hover:underline">
            Voir le diagnostic complet →
          </a>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {points.map((point, index) => (
            <div key={point.key} className="animate-rise" style={{ animationDelay: `${index * 60}ms` }}>
              <PriorityItem rank={(index + 1) as 1 | 2 | 3} point={point} />
            </div>
          ))}

          {points.length < 3 && unlockHints.length > 0 && (
            <div className="sticker-card-dashed p-6">
              <p className="text-sm font-medium">Débloquer plus de diagnostics</p>
              <ul className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                {unlockHints.map((hint) => (
                  <li key={hint}>• {hint}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
