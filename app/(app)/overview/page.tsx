import { after } from "next/server";

import { Falco } from "@/components/falco/falco";
import { FalcoEmptyState } from "@/components/falco/falco-empty-state";
import { MetricSummaryCard } from "@/components/metric-summary-card";
import { OverviewActiveLeverCard } from "@/components/overview-active-lever-card";
import { OverviewFunnelVisual } from "@/components/overview-funnel-visual";
import type { ChartPoint, OverviewMetricOption } from "@/components/overview-revenue-chart";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import { computeClosingRates } from "@/lib/closing/metrics";
import { getContentPosts } from "@/lib/content-posts/queries";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { buildMetricCards, inRange } from "@/lib/dashboard/metrics";
import { computeDiagnosticPoints, computeMetricHealthCards, computeMetricSummaries } from "@/lib/diagnostic/cascade";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { aggregateContentTotals, computeContentMetricSummaries, getContentDiagnosticBenchmarks } from "@/lib/diagnostic/content-metrics";
import { lastCompletedMonths, type MonthWindow } from "@/lib/diagnostic/completed-months";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { findOverviewBottleneck } from "@/lib/funnel/overview";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { resolveMonthCashCollected, resolveMonthClosingTotals, resolveMonthSettingTotals } from "@/lib/monthly-metrics/resolve";
import { computeFunnelRates } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { OverviewInteractive } from "./overview-interactive";
import { PeriodSelect } from "./period-select";

const METRIC_CARD_KEYS = ["revenue", "leads", "sales-page-conversion", "closing-rate", "average-sale"];

function periodToMonths(period: string): MonthWindow[] {
  const all = lastCompletedMonths(12);
  if (period === "year") {
    const currentYear = new Date().getUTCFullYear();
    return all.filter((m) => m.year === currentYear);
  }
  const count = period === "3" ? 3 : period === "12" ? 12 : 6;
  return all.slice(-count);
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: rawPeriod } = await searchParams;
  const period = rawPeriod && ["3", "6", "12", "year"].includes(rawPeriod) ? rawPeriod : "6";

  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "dashboard");

  const months = periodToMonths(period);

  const [businessProfile, { allSettingEntries, allClosingEntries, allMonthlyRows }, benchmarks, contentBenchmarks, allContentPosts] =
    await Promise.all([
      getBusinessProfile(accountId),
      getDiagnosticKpiRawData(accountId),
      getDiagnosticBenchmarks(user?.sector ?? null),
      getContentDiagnosticBenchmarks(user?.sector ?? null),
      getContentPosts(accountId),
    ]);

  const hasAnyDataEver = allMonthlyRows.length > 0 || allSettingEntries.length > 0 || allClosingEntries.length > 0;

  after(() => track("overview_viewed", userId, { period }));

  if (!hasAnyDataEver) {
    return (
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Vue d&apos;ensemble</h1>
          <p className="mt-1.5 text-sm font-bold text-muted-foreground">Toutes tes datas, en un coup d&apos;œil.</p>
        </div>
        <FalcoEmptyState title="Remplis tes chiffres pour débloquer ta vue d'ensemble">
          <Button size="sm" asChild className="mt-3">
            <a href="/datas">Remplir mes chiffres →</a>
          </Button>
        </FalcoEmptyState>
      </div>
    );
  }

  // Bloc 1 — reuses Dashboard's own card builder as-is (same 6 cards it
  // computes internally); we only display the 4 the brief asks for.
  const allMetricCards = buildMetricCards({
    businessProfile,
    allSettingEntries,
    allClosingEntries,
    allMonthlyRows,
    isStripeConnected: Boolean(user?.stripeConnectId),
  });
  const metricCards = allMetricCards.filter((card) => METRIC_CARD_KEYS.includes(card.key));

  // Bloc 2/3/4 — same aggregation engine as Dashboard/Diagnostic for the
  // selected period, so numbers agree everywhere.
  const { settingTotals, closingTotals, cashContractedTotal, hasAnyMonthlyRow } = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
  });
  const settingRates = computeFunnelRates(settingTotals);
  const closingRates = computeClosingRates(closingTotals, settingTotals.callsBooked);
  const bottleneck = findOverviewBottleneck(settingRates, closingRates);
  const metricScores = computeMetricHealthCards({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal });

  // Per-pillar gauges (replaces "À mettre en place") — same engine/component
  // as Diagnostic's Bloc 3 (computeMetricSummaries/computeContentMetricSummaries
  // + MetricSummaryCard), so the numbers agree exactly with /diagnostic.
  const summaries = computeMetricSummaries({ settingTotals, closingTotals, benchmarks });
  const contentTotals = aggregateContentTotals(months, allContentPosts);
  const contentSummaries = computeContentMetricSummaries({ totals: contentTotals, benchmarks: contentBenchmarks });

  const bottleneckPoint = hasAnyMonthlyRow
    ? computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal })[0]
    : undefined;

  // Per-month series for the main chart — reuses the exact same resolve
  // functions as buildMetricCards/aggregatePeriodTotals, just kept per-month
  // instead of summed. "hasX" flags mirror lib/dashboard/metrics.ts's own
  // hasAnySettingData/hasAnyClosingData check so a month with nothing
  // entered renders as a real gap (null), never a fabricated 0.
  const monthlySeries = months.map(({ year, month, range }) => {
    const monthlyRow = allMonthlyRows.find((row) => row.year === year && row.month === month) ?? null;
    const dailySetting = allSettingEntries.filter((e) => inRange(e.date, range));
    const dailyClosing = allClosingEntries.filter((e) => inRange(e.date, range));
    const hasSetting = dailySetting.length > 0 || monthlyRow?.newFollowers !== null || monthlyRow?.callsBooked !== null;
    const hasClosing = dailyClosing.length > 0 || monthlyRow?.callsTaken !== null || monthlyRow?.salesClosed !== null;

    const monthSetting = resolveMonthSettingTotals(monthlyRow, dailySetting);
    const monthClosing = resolveMonthClosingTotals(monthlyRow, dailyClosing);
    const cash = resolveMonthCashCollected(monthlyRow);
    const label = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" });

    return {
      label,
      ca: cash.amount,
      leads: hasSetting ? monthSetting.newSubscribers : null,
      rdv: hasSetting ? monthSetting.callsBooked : null,
      ventes: hasClosing ? monthClosing.salesClosed : null,
    };
  });

  const chartSeries: Record<OverviewMetricOption, ChartPoint[]> = {
    ca: monthlySeries.map((m) => ({ label: m.label, value: m.ca })),
    leads: monthlySeries.map((m) => ({ label: m.label, value: m.leads })),
    rdv: monthlySeries.map((m) => ({ label: m.label, value: m.rdv })),
    ventes: monthlySeries.map((m) => ({ label: m.label, value: m.ventes })),
  };

  // Bloc 4 — same Découverte engine as /diagnostic's own summary widget
  // (app/(app)/diagnostic/page.tsx), just sliced to 3 instead of 2 and with
  // "toWatch" re-sorted best-first (native order is worst-first, meant for
  // the surveillance use case there, not "leviers actifs" here).
  const { toWatch } = await computeLeverOpportunities({
    accountId,
    businessProfile,
    settingTotals,
    closingTotals,
    cashContractedTotal,
    periodMonths: Math.max(months.length, 1),
  });
  const bestActiveLevers = [...toWatch].sort((a, b) => b.score - a.score).slice(0, 3);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Vue d&apos;ensemble</h1>
          <p className="mt-1.5 text-sm font-bold text-muted-foreground">Toutes tes datas, en un coup d&apos;œil.</p>
        </div>
        <PeriodSelect value={period} />
      </div>

      <OverviewInteractive metricCards={metricCards} chartSeries={chartSeries} goalValue={businessProfile.identity.mrrGoal} />

      <div className="grid gap-5 lg:grid-cols-[2fr_3fr]">
        <div className="sticker-card p-6">
          <OverviewFunnelVisual
            settingTotals={settingTotals}
            closingTotals={closingTotals}
            settingRates={settingRates}
            closingRates={closingRates}
            metricScores={metricScores}
            bottleneck={bottleneck}
          />
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <h2 className="text-base font-bold">Ton goulot actuel</h2>
            {bottleneckPoint ? (
              <div className="sticker-spotlight animate-rise flex flex-wrap items-center gap-4 px-6 py-4">
                <Falco pose="alert" size="xs" animate="enter" className="hidden sm:flex" />
                <div className="flex flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <p className="text-xs font-bold text-mist/70">{bottleneckPoint.label}</p>
                  <p className="gradient-text text-2xl font-bold tracking-[-0.01em] tabular-nums">
                    {bottleneckPoint.monthlyGain === null ? "—" : formatEur(bottleneckPoint.monthlyGain)}
                  </p>
                  <p className="text-xs text-mist/60">manque à gagner détecté</p>
                </div>
                <Button size="sm" asChild>
                  <a href={`/diagnostic?open=${bottleneckPoint.key}`}>Améliorer →</a>
                </Button>
              </div>
            ) : (
              <FalcoEmptyState title="Aucun goulot détecté sur cette période" showFalco={false}>
                <p className="text-sm font-bold text-muted-foreground">Tout est au-dessus du benchmark. Bien joué.</p>
              </FalcoEmptyState>
            )}
          </div>

          {/* Fills the empty space left under the (short) goulot banner next
              to the (tall) funnel — same section as before, just relocated.
              Same gauge/component as Diagnostic's "Tout ton business en un
              coup d'œil" (Bloc 3), so you can spot which pillar to improve
              without leaving Overview. */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold">Où sont tes goulots</h2>
              <a href="/diagnostic" className="text-sm font-bold text-muted-foreground hover:underline">
                Voir le diagnostic complet →
              </a>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {summaries.map((summary) => (
                <MetricSummaryCard
                  key={summary.key}
                  summary={summary}
                  measureHint="Renseigne tes chiffres du funnel dans Datas."
                  measureHintHref="/datas"
                  measureHintLabel="Aller sur Datas →"
                />
              ))}
              {contentSummaries.map((summary) => (
                <MetricSummaryCard
                  key={summary.key}
                  summary={summary}
                  measureHint="Renseigne les vues et clics de tes posts dans Contenu."
                  measureHintHref="/acquisition/contenu"
                  measureHintLabel="Aller sur Contenu →"
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold">Tes leviers actifs</h2>
          <a href="/diagnostic" className="text-sm font-bold text-muted-foreground hover:underline">
            Voir l&apos;Optimisation →
          </a>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {bestActiveLevers.length > 0 ? (
            bestActiveLevers.map((lever) => <OverviewActiveLeverCard key={lever.leverKey} {...lever} />)
          ) : (
            <FalcoEmptyState title="Aucun levier actif renseigné pour l'instant" showFalco={false}>
              <p className="text-sm font-bold text-muted-foreground">Réponds au questionnaire Optimisation pour les voir ici.</p>
            </FalcoEmptyState>
          )}
        </div>
      </div>
    </div>
  );
}
