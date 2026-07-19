import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";

import { AutoOpenImprove } from "./auto-open-improve";
import { BusinessNudgeBanner } from "@/components/business-nudge-banner";
import { CalcPopover } from "@/components/calc-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RateVsBenchmarkBar } from "@/components/rate-vs-benchmark-bar";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { isBusinessProfileThin } from "@/lib/business/thinness";
import { track } from "@/lib/analytics";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import {
  aggregateContentTotals,
  computeContentMetricSummaries,
  getContentDiagnosticBenchmarks,
} from "@/lib/diagnostic/content-metrics";
import { currentMonthWindow, lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import {
  computeDiagnosticPoints,
  computeFullBenchmarkProjection,
  computeMetricSummaries,
} from "@/lib/diagnostic/cascade";
import {
  aggregateTestimonialCount,
  computeTestimonialSummary,
  getTestimonialBenchmark,
} from "@/lib/diagnostic/delivery-metrics";
import { computeFollowupCompliance } from "@/lib/diagnostic/followups";
import { formatEur } from "@/lib/currency";
import { getContentPosts } from "@/lib/content-posts/queries";
import { getCurrentUser } from "@/lib/current-user";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { getTestimonials } from "@/lib/testimonials/queries";
import { cn } from "@/lib/utils";

const PERIOD_LABELS: Record<string, string> = {
  "3-months": "3 derniers mois",
  "current-month": "mois en cours",
  "12-months": "12 mois",
};

const STATUS_ICON: Record<string, string> = { ok: "✅", caution: "⚠️", critical: "❌", unmeasured: "❓" };
const STATUS_BADGE: Record<string, string> = {
  ok: "bg-state-healthy-bg text-state-healthy",
  caution: "bg-state-caution-bg text-state-caution",
  critical: "bg-state-critical-bg text-state-critical",
  unmeasured: "bg-muted text-muted-foreground",
};

const MEASURE_HINTS: Record<string, string> = {
  responseRate: "Renseigne tes premiers messages envoyés et tes conversations démarrées dans Datas.",
  proposalRate: "Renseigne tes conversations démarrées et tes appels proposés dans Datas.",
  bookingRate: "Renseigne tes appels proposés et réservés dans Datas.",
  showUpRate: "Renseigne tes appels réservés et pris dans Datas.",
  closingRate: "Renseigne tes appels pris et tes ventes conclues dans Datas.",
  content_click_rate: "Renseigne les vues et les clics de tes posts dans Contenu.",
  content_lead_rate: "Renseigne les clics et les leads de tes posts dans Contenu.",
  testimonial_rate: "Collecte des témoignages dans Témoignages une fois que tu as assez de ventes conclues.",
};

export default async function DiagnosticPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { userId, user } = await getCurrentUser();
  const params = await searchParams;
  await track("diagnostic_viewed", userId);
  const period = params.period && PERIOD_LABELS[params.period] ? params.period : "3-months";

  const businessProfile = await getBusinessProfile(userId);

  const [allSettingEntries, allClosingEntries, allMonthlyRows, allContentPosts, allTestimonials] = await Promise.all([
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, userId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, userId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(userId),
    getContentPosts(userId),
    getTestimonials(userId),
  ]);

  const months = period === "current-month" ? [currentMonthWindow()] : lastCompletedMonths(period === "12-months" ? 12 : 3);

  const { settingTotals, closingTotals, cashContractedTotal, hasAnyMonthlyRow } = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
  });

  if (!hasAnyMonthlyRow) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-medium">Ton diagnostic</h1>
        <p className="max-w-md text-muted-foreground">
          Remplis au moins un mois dans Datas pour lancer ton diagnostic.
        </p>
        <Button size="lg" asChild className="mt-2">
          <a href="/datas">Remplir mes datas →</a>
        </Button>
      </div>
    );
  }

  const benchmarks = await getDiagnosticBenchmarks(user?.sector ?? null);
  const contentBenchmarks = await getContentDiagnosticBenchmarks(user?.sector ?? null);
  const contentTotals = aggregateContentTotals(months, allContentPosts);
  const contentSummaries = computeContentMetricSummaries({ totals: contentTotals, benchmarks: contentBenchmarks });
  const testimonialBenchmark = await getTestimonialBenchmark(user?.sector ?? null);
  const testimonialCount = aggregateTestimonialCount(months, allTestimonials);
  const testimonialSummary = computeTestimonialSummary({
    count: testimonialCount,
    salesClosed: closingTotals.salesClosed,
    benchmark: testimonialBenchmark,
  });
  const processSteps = businessProfile.delivery.processSteps;
  const processImplemented = processSteps.filter((step) => step.implemented).length;
  const points = computeDiagnosticPoints({
    settingTotals,
    closingTotals,
    benchmarks,
    businessProfile,
    cashContractedTotal,
  });
  const summaries = computeMetricSummaries({ settingTotals, closingTotals, benchmarks });
  const followups = computeFollowupCompliance(businessProfile);
  const projection = computeFullBenchmarkProjection({
    settingTotals,
    closingTotals,
    benchmarks,
    businessProfile,
    cashContractedTotal,
  });

  const topPoints = points.slice(0, 3);
  const totalExtraClients = Math.round(topPoints.reduce((sum, p) => sum + p.extraClients, 0) * 10) / 10;
  const totalMonthlyGain = topPoints.some((p) => p.monthlyGain === null)
    ? null
    : topPoints.reduce((sum, p) => sum + (p.monthlyGain ?? 0), 0);
  const mainOffer = businessProfile.sales.offers.find((offer) => offer.isMain);
  const isThin = isBusinessProfileThin(businessProfile);

  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AutoOpenImprove />
      </Suspense>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] leading-[1.2] font-medium tracking-[-0.01em]">Ton diagnostic</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            J&apos;ai analysé tes chiffres des {PERIOD_LABELS[period]}. Voilà ce que ça donne.
          </p>
        </div>
        <div className="flex gap-2">
          {Object.entries(PERIOD_LABELS).map(([value, label]) => (
            <Link
              key={value}
              href={`/diagnostic?period=${value}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-medium",
                period === value ? "border-signal bg-signal/15 text-signal" : "border-border text-muted-foreground"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {isThin && <BusinessNudgeBanner />}

      {/* Bloc 1 — Le verdict */}
      <div className="sticker-spotlight px-7 py-6">
        <p className="text-xs text-mist/70">Potentiel total détecté</p>
        <p className="mt-2 text-[38px] leading-[1.1] font-medium tracking-[-0.02em] tabular-nums">
          {totalMonthlyGain === null ? "—" : `${formatEur(totalMonthlyGain)}/mois`}
        </p>
        <p className="mt-2 text-sm text-mist/70">
          +{totalExtraClients} clients/mois possibles en corrigeant tes {topPoints.length} points les plus faibles
        </p>
        <div className="mt-4 flex items-center gap-2 text-xs text-mist/60">
          {mainOffer?.price ? (
            <span>
              Calculé avec ton offre {mainOffer.name || "principale"} à {formatEur(mainOffer.price)}
            </span>
          ) : (
            <span>Calculé avec ton panier moyen réel (aucune offre principale définie)</span>
          )}
          <CalcPopover explanation="Pour chaque point sous benchmark, je simule ton funnel avec CE taux ramené au niveau du marché (les autres restent réels), puis je multiplie les ventes en plus par le prix de ton offre. Je ne cumule que les 3 premiers points pour rester crédible." />
        </div>
      </div>

      {/* Bloc 2 — Les points à améliorer */}
      <div className="flex flex-col gap-4">
        <h2 className="text-base font-medium">Points à améliorer</h2>
        {points.length === 0 && (
          <div className="sticker-card-dashed p-6 text-center text-sm text-muted-foreground">
            Tous tes taux mesurés sont au niveau du benchmark. 🎉
          </div>
        )}
        {points.map((point, index) => (
          <div
            key={point.key}
            className={cn("sticker-card flex flex-col gap-4 p-6", index === 0 && "border-signal bg-signal/5")}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-lg">{STATUS_ICON[point.status]}</span>
                <div>
                  <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    #{index + 1} · {point.category}
                  </p>
                  <p className="mt-0.5 font-medium">{point.label}</p>
                </div>
              </div>
            </div>

            <RateVsBenchmarkBar currentRate={point.currentRatePercent / 100} benchmarkRate={point.benchmarkRatePercent / 100} />

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs font-medium text-muted-foreground">Clients en plus</p>
                <p className="mt-1 font-display text-xl font-medium">+{point.extraClients}/mois</p>
              </div>
              <div className="flex items-start justify-between rounded-xl bg-muted p-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Gain{point.isPriceFallback ? " (panier moyen)" : ""}
                  </p>
                  <p className="mt-1 font-display text-xl font-medium">
                    {point.monthlyGain === null ? "—" : `+${formatEur(point.monthlyGain)}/mois`}
                  </p>
                  {point.yearlyGain !== null && (
                    <p className="text-xs text-muted-foreground">soit {formatEur(point.yearlyGain)} sur un an</p>
                  )}
                </div>
                <CalcPopover explanation={point.tooltip} />
              </div>
            </div>

            <p className="text-sm text-muted-foreground">{point.explanation}</p>

            <a href={`#metric-${point.key}`} className="self-start text-sm font-medium text-muted-foreground hover:underline">
              Voir le détail
            </a>
          </div>
        ))}
      </div>

      {/* Bloc 3 — La vue complète */}
      <div>
        <h2 className="text-base font-medium">Tout ton business en un coup d&apos;œil</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <div key={summary.key} id={`metric-${summary.key}`} className="sticker-card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{summary.label}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_BADGE[summary.status])}>
                  {STATUS_ICON[summary.status]}
                </span>
              </div>
              {summary.status === "unmeasured" ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="mt-2 text-left text-xs text-muted-foreground hover:underline">
                      Pas encore mesuré — comment mesurer ça ?
                    </button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <p className="text-muted-foreground">{MEASURE_HINTS[summary.key]}</p>
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <a href="/datas">Aller sur Datas →</a>
                    </Button>
                  </PopoverContent>
                </Popover>
              ) : (
                <div className="mt-3">
                  <RateVsBenchmarkBar
                    currentRate={summary.currentRatePercent === null ? null : summary.currentRatePercent / 100}
                    benchmarkRate={summary.benchmarkRatePercent / 100}
                    compact
                  />
                </div>
              )}
            </div>
          ))}

          {contentSummaries.map((summary) => (
            <div key={summary.key} id={`metric-${summary.key}`} className="sticker-card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{summary.label}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_BADGE[summary.status])}>
                  {STATUS_ICON[summary.status]}
                </span>
              </div>
              {summary.status === "unmeasured" ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="mt-2 text-left text-xs text-muted-foreground hover:underline">
                      Pas encore mesuré — comment mesurer ça ?
                    </button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <p className="text-muted-foreground">{MEASURE_HINTS[summary.key]}</p>
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <a href="/acquisition/contenu">Aller sur Contenu →</a>
                    </Button>
                  </PopoverContent>
                </Popover>
              ) : (
                <div className="mt-3">
                  <RateVsBenchmarkBar
                    currentRate={summary.currentRatePercent === null ? null : summary.currentRatePercent / 100}
                    benchmarkRate={summary.benchmarkRatePercent / 100}
                    compact
                  />
                </div>
              )}
            </div>
          ))}

          <div key={testimonialSummary.key} id={`metric-${testimonialSummary.key}`} className="sticker-card p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{testimonialSummary.label}</p>
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_BADGE[testimonialSummary.status])}>
                {STATUS_ICON[testimonialSummary.status]}
              </span>
            </div>
            {testimonialSummary.status === "unmeasured" ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="mt-2 text-left text-xs text-muted-foreground hover:underline">
                    Pas encore mesuré — comment mesurer ça ?
                  </button>
                </PopoverTrigger>
                <PopoverContent>
                  <p className="text-muted-foreground">{MEASURE_HINTS[testimonialSummary.key]}</p>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <a href="/delivrabilite/temoignages">Aller sur Témoignages →</a>
                  </Button>
                </PopoverContent>
              </Popover>
            ) : (
              <div className="mt-3">
                <RateVsBenchmarkBar
                  currentRate={testimonialSummary.currentRatePercent === null ? null : testimonialSummary.currentRatePercent / 100}
                  benchmarkRate={testimonialSummary.benchmarkRatePercent / 100}
                  compact
                />
              </div>
            )}
          </div>

          <div className="sticker-card p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Process de délivrabilité</p>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-medium",
                  processSteps.length === 0
                    ? STATUS_BADGE.unmeasured
                    : processImplemented === processSteps.length
                      ? STATUS_BADGE.ok
                      : processImplemented === 0
                        ? STATUS_BADGE.critical
                        : STATUS_BADGE.caution
                )}
              >
                {processSteps.length === 0
                  ? STATUS_ICON.unmeasured
                  : processImplemented === processSteps.length
                    ? STATUS_ICON.ok
                    : processImplemented === 0
                      ? STATUS_ICON.critical
                      : STATUS_ICON.caution}
              </span>
            </div>
            {processSteps.length === 0 ? (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="mt-2 text-left text-xs text-muted-foreground hover:underline">
                    Pas encore renseigné — comment mesurer ça ?
                  </button>
                </PopoverTrigger>
                <PopoverContent>
                  <p className="text-muted-foreground">Définis ta checklist de délivrabilité dans Process.</p>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <a href="/delivrabilite/process">Aller sur Process →</a>
                  </Button>
                </PopoverContent>
              </Popover>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {processImplemented}/{processSteps.length} étapes en place
              </p>
            )}
          </div>

          {followups.map((followup) => (
            <div key={followup.key} className="sticker-card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{followup.label}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_BADGE[followup.status])}>
                  {followup.status === "ok" ? "✅" : followup.status === "critical" ? "❌" : "❓"}
                </span>
              </div>
              {followup.status === "unmeasured" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="mt-2 text-left text-xs text-muted-foreground hover:underline">
                      Pas encore renseigné — comment mesurer ça ?
                    </button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <p className="text-muted-foreground">
                      Indique si tu as une séquence de relance dans Mon business, section Vente.
                    </p>
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <a href="/business">Aller sur Mon business →</a>
                    </Button>
                  </PopoverContent>
                </Popover>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bloc 4 — Le simulateur cumulé */}
      <div className="sticker-card-dashed p-6">
        <p className="text-sm font-medium">Et si tu corrigeais tout ?</p>
        <p className="mt-2 text-lg">
          {projection.realSales === null ? "—" : `${Math.round(projection.realSales * 10) / 10} ventes/mois aujourd'hui`}
          {" → "}
          {projection.simulatedSales === null ? "—" : `${Math.round(projection.simulatedSales * 10) / 10} possibles`}
          {projection.monthlyGain !== null && `, soit +${formatEur(projection.monthlyGain)}/mois`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Projection si tout est au benchmark en même temps — différente de la somme des points ci-dessus (les
          améliorations se multiplient entre elles).
        </p>
      </div>
    </div>
  );
}
