import { desc, eq } from "drizzle-orm";

import { MetricCard } from "@/components/metric-card";
import { PriorityItem } from "@/components/priority-item";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { getBenchmark } from "@/lib/benchmarks";
import { getBusinessProfile } from "@/lib/business/queries";
import { computeDashboardBottlenecks, getBottleneckUnlockHints } from "@/lib/dashboard/bottlenecks";
import { currentIsoWeekRange, dashboardStripeRange, inRange, buildMetricCards } from "@/lib/dashboard/metrics";
import { getStripeActivity } from "@/lib/dashboard/stripe-metrics";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { toIsoDate, todayUtc } from "@/lib/date-range";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { resolveMonthClosingTotals, resolveMonthSettingTotals } from "@/lib/monthly-metrics/resolve";
import { computeClosingRates } from "@/lib/closing/metrics";
import { computeFunnelRates } from "@/lib/setting/funnel";

export default async function DashboardPage() {
  const { userId, user } = await getCurrentUser();
  const businessProfile = await getBusinessProfile(userId);

  const [allSettingEntries, allClosingEntries, allMonthlyRows] = await Promise.all([
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
  ]);

  const stripeActivity = await getStripeActivity(userId, dashboardStripeRange());
  const benchmark = getBenchmark(user?.sector ?? null);
  const firstName = user?.email.split("@")[0] || "là";

  const metricCards = buildMetricCards({
    businessProfile,
    allSettingEntries,
    allClosingEntries,
    allMonthlyRows,
    stripeActivity,
  });

  // Current calendar month, merged: a monthly_metrics row (if any non-null
  // field in a section) wins wholesale over that month's daily entries.
  const today = todayUtc();
  const currentYear = today.getUTCFullYear();
  const currentMonth = today.getUTCMonth() + 1;
  const currentMonthRange = { from: toIsoDate(new Date(Date.UTC(currentYear, currentMonth - 1, 1))), to: toIsoDate(today) };
  const currentMonthlyRow = allMonthlyRows.find((row) => row.year === currentYear && row.month === currentMonth) ?? null;

  const currentSettingTotals = resolveMonthSettingTotals(
    currentMonthlyRow,
    allSettingEntries.filter((entry) => inRange(entry.date, currentMonthRange))
  );
  const currentClosingTotals = resolveMonthClosingTotals(
    currentMonthlyRow,
    allClosingEntries.filter((entry) => inRange(entry.date, currentMonthRange))
  );
  const mainOfferPrice = businessProfile.sales.offers.find((offer) => offer.isMain)?.price ?? null;

  const bottlenecks = computeDashboardBottlenecks({
    settingTotals: currentSettingTotals,
    settingRates: computeFunnelRates(currentSettingTotals),
    closingTotals: currentClosingTotals,
    closingRates: computeClosingRates(currentClosingTotals, currentSettingTotals.callsBooked),
    benchmark,
    mainOfferPrice,
  });

  const unlockHints = getBottleneckUnlockHints({
    mainOfferPrice,
    hasSettingEntries: allSettingEntries.length > 0 || allMonthlyRows.some((row) => row.newFollowers !== null),
    hasClosingEntries: allClosingEntries.length > 0 || allMonthlyRows.some((row) => row.callsTaken !== null),
  });

  const totalMonthlyLoss = bottlenecks.reduce((sum, b) => sum + b.estimatedMonthlyLoss, 0);

  const weekRange = currentIsoWeekRange();
  const checkInDoneThisWeek =
    allSettingEntries.some((entry) => inRange(entry.date, weekRange)) ||
    allClosingEntries.some((entry) => inRange(entry.date, weekRange)) ||
    currentMonthlyRow !== null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-4xl font-bold">Salut, {firstName}</h1>
        <p className="mt-1.5 text-muted-foreground">
          {bottlenecks.length > 0
            ? "Voici où en est ton business, et ce qu'il faut corriger en premier."
            : "Ton business tourne bien. Voici où creuser pour accélérer."}
        </p>
      </div>

      {/* Bloc 1 — always the honest empty-state: no execution engine exists
          yet to attribute real recovered/generated value to (see plan doc). */}
      <div className="sticker-spotlight p-10">
        <p className="text-sm font-medium text-mist/70">Manque à gagner détecté</p>
        <p className="mt-3 font-display text-6xl font-bold tabular-nums sm:text-7xl">
          {formatEur(totalMonthlyLoss)}
        </p>
        <p className="mt-2 text-sm text-mist/70">
          {bottlenecks.length > 0
            ? `sur ${bottlenecks.length} goulot${bottlenecks.length > 1 ? "s" : ""} identifié${bottlenecks.length > 1 ? "s" : ""}`
            : "renseigne ton offre et tes chiffres pour le chiffrer"}
        </p>
        <Button size="lg" asChild className="mt-6">
          <a href="/agent">Récupérer ce cash →</a>
        </Button>
      </div>

      {!checkInDoneThisWeek && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border-2 border-dashed border-border bg-card/50 px-5 py-3">
          <p className="text-sm font-medium">
            📊 2 minutes pour mettre à jour tes chiffres de la semaine
          </p>
          <Button asChild size="sm" variant="outline">
            <a href="/datas">Faire mon check-in</a>
          </Button>
        </div>
      )}

      <div>
        <h2 className="text-xl font-bold">Tes chiffres clés</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Mois en cours, comparé au mois précédent.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {metricCards.map((card) => (
            <MetricCard key={card.key} data={card} />
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold">À corriger en priorité</h2>
          <a href="/diagnostic" className="text-sm font-medium text-muted-foreground hover:underline">
            Voir le diagnostic complet →
          </a>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {bottlenecks.map((bottleneck, index) => (
            <PriorityItem key={bottleneck.key} rank={(index + 1) as 1 | 2 | 3} bottleneck={bottleneck} />
          ))}

          {bottlenecks.length < 3 && unlockHints.length > 0 && (
            <div className="sticker-card-dashed p-6">
              <p className="text-sm font-bold">Débloquer plus de diagnostics</p>
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
