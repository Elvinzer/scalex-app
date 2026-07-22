import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";

import { AutoOpenImprove } from "./auto-open-improve";
import { DiscoveryOpportunityCard } from "./discovery-opportunity-card";
import { getDiscoveryProgress } from "./discovery-actions";
import { DiscoveryTab } from "./discovery-tab";
import { FunnelTab } from "./funnel-tab";
import { InsightsTab } from "./insights-tab";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { BusinessNudgeBanner } from "@/components/business-nudge-banner";
import { Falco } from "@/components/falco/falco";
import { FalcoBubble } from "@/components/falco/falco-bubble";
import { CalcPopover } from "@/components/calc-popover";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RateVsBenchmarkBar } from "@/components/rate-vs-benchmark-bar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { computeFollowupCompliance } from "@/lib/diagnostic/followups";
import { formatEur } from "@/lib/currency";
import { getContentPosts } from "@/lib/content-posts/queries";
import { getCurrentUser } from "@/lib/current-user";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { cn } from "@/lib/utils";

type DiagnosticTab = "overview" | "funnel" | "insights" | "discovery";

function resolveTab(value: string | undefined): DiagnosticTab {
  return value === "funnel" || value === "insights" || value === "discovery" ? value : "overview";
}

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
};

export default async function DiagnosticPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    tab?: string;
    range?: string | string[];
    from?: string | string[];
    to?: string | string[];
  }>;
}) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "diagnostic");
  const params = await searchParams;
  const tab = resolveTab(params.tab);
  after(() => track("diagnostic_viewed", userId));
  const period = params.period && PERIOD_LABELS[params.period] ? params.period : "3-months";
  const hasWorkingKey = Boolean(user?.anthropicApiKeyEncrypted) && !user?.anthropicApiKeyInvalid;
  const discoveryProgress = await getDiscoveryProgress(accountId);
  const discoveryRemaining = discoveryProgress.total - discoveryProgress.answered;

  const tabsHeader = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Ton diagnostic</h1>
      <Tabs value={tab}>
        <TabsList>
          <TabsTrigger value="overview" asChild>
            <Link href="/diagnostic?tab=overview">Vue d&apos;ensemble</Link>
          </TabsTrigger>
          <TabsTrigger value="funnel" asChild>
            <Link href="/diagnostic?tab=funnel">Funnel</Link>
          </TabsTrigger>
          <TabsTrigger value="insights" asChild>
            <Link href="/diagnostic?tab=insights">Insights</Link>
          </TabsTrigger>
          <TabsTrigger value="discovery" asChild>
            <Link href="/diagnostic?tab=discovery" className="flex items-center gap-1.5">
              Découverte
              {discoveryRemaining > 0 && (
                <span className="rounded-full bg-accent-2/20 px-1.5 py-0.5 text-[10px] font-bold text-accent-2">
                  {discoveryRemaining}
                </span>
              )}
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );

  if (tab === "funnel") {
    return (
      <div className="flex flex-col gap-8">
        {tabsHeader}
        <FunnelTab accountId={accountId} sector={user?.sector ?? null} hasWorkingKey={hasWorkingKey} searchParams={params} />
      </div>
    );
  }

  if (tab === "insights") {
    return (
      <div className="flex flex-col gap-8">
        {tabsHeader}
        <InsightsTab accountId={accountId} />
      </div>
    );
  }

  if (tab === "discovery") {
    return (
      <div className="flex flex-col gap-8">
        {tabsHeader}
        <DiscoveryTab accountId={accountId} />
      </div>
    );
  }

  const businessProfile = await getBusinessProfile(accountId);

  const [allSettingEntries, allClosingEntries, allMonthlyRows, allContentPosts] = await Promise.all([
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, accountId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, accountId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(accountId),
    getContentPosts(accountId),
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
      <div className="flex flex-col gap-8">
        {tabsHeader}
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="max-w-md text-muted-foreground">
            Remplis au moins un mois dans Mes chiffres pour lancer ton diagnostic.
          </p>
          <Button size="lg" asChild className="mt-2">
            <a href="/datas">Remplir mes chiffres →</a>
          </Button>
        </div>
      </div>
    );
  }

  const [benchmarks, contentBenchmarks] = await Promise.all([
    getDiagnosticBenchmarks(user?.sector ?? null),
    getContentDiagnosticBenchmarks(user?.sector ?? null),
  ]);
  const contentTotals = aggregateContentTotals(months, allContentPosts);
  const contentSummaries = computeContentMetricSummaries({ totals: contentTotals, benchmarks: contentBenchmarks });
  const points = computeDiagnosticPoints({
    settingTotals,
    closingTotals,
    benchmarks,
    businessProfile,
    cashContractedTotal,
  });
  const summaries = computeMetricSummaries({ settingTotals, closingTotals, benchmarks });
  const followups = computeFollowupCompliance(businessProfile);
  // Max 2, highest impact first — never more, so it doesn't drown the real
  // goulots above it (explicit rule from the Découverte brief).
  const { toImplement: discoveryOpportunities } = await computeLeverOpportunities({
    accountId,
    businessProfile,
    settingTotals,
    closingTotals,
    cashContractedTotal,
    periodMonths: months.length,
  });
  const topDiscoveryOpportunities = discoveryOpportunities.slice(0, 2);
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

  // Falco's one-line verdict for the overview header (the single content
  // Falco on this screen — only the overview tab, not Funnel/Insights).
  const verdictLine =
    topPoints.length > 0
      ? `J'ai repéré ton goulot : ${topPoints[0].label}${totalMonthlyGain !== null ? ` — ≈${formatEur(totalMonthlyGain)}/mois à récupérer` : ""}.`
      : "Tes taux mesurés sont au niveau du benchmark — solide.";

  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AutoOpenImprove />
      </Suspense>

      {tabsHeader}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <Falco pose="thinking" size="sm" animate="enter" withBubble bubbleText={verdictLine} className="max-w-full" />
        <div className="flex gap-2">
          {Object.entries(PERIOD_LABELS).map(([value, label]) => (
            <Link
              key={value}
              href={`/diagnostic?tab=overview&period=${value}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-bold transition-all duration-200",
                period === value
                  ? "border-transparent text-white shadow-[0_2px_10px_var(--accent-glow)]"
                  : "border-border text-muted-foreground hover:border-border-hover"
              )}
              style={period === value ? { background: "var(--gradient-accent)" } : undefined}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {isThin && <BusinessNudgeBanner />}

      {/* Bloc 1 — Le verdict */}
      <div className="sticker-spotlight animate-rise px-7 py-6">
        <p className="text-xs text-mist/70">Potentiel total détecté</p>
        <p className="gradient-text mt-2 text-[38px] leading-[1.1] font-bold tracking-[-0.02em] tabular-nums">
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
        <h2 className="text-base font-bold">Points à améliorer</h2>
        {points.length === 0 && (
          <div className="sticker-card-dashed flex flex-col items-center gap-3 p-6 text-center">
            <Falco
              pose="happy"
              size="md"
              animate="enter"
              withBubble
              bubbleText="Tous tes taux mesurés sont au niveau du benchmark. Bravo !"
              bubbleSide="left"
            />
          </div>
        )}
        {points.map((point, index) => (
          <div
            key={point.key}
            className={cn(
              "sticker-card animate-rise flex flex-col gap-4 p-6",
              index === 0 && "border-accent/40 bg-linear-to-br from-accent-soft to-transparent"
            )}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="text-lg">{STATUS_ICON[point.status]}</span>
                <div>
                  <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                    #{index + 1} · {point.category}
                  </p>
                  <p className="mt-0.5 font-bold">{point.label}</p>
                </div>
              </div>
            </div>

            <RateVsBenchmarkBar currentRate={point.currentRatePercent / 100} benchmarkRate={point.benchmarkRatePercent / 100} />

            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl bg-muted p-3">
                <p className="text-xs font-bold text-muted-foreground">Clients en plus</p>
                <p className="mt-1 font-display text-xl font-bold">+{point.extraClients}/mois</p>
              </div>
              <div className="flex items-start justify-between rounded-xl bg-muted p-3">
                <div>
                  <p className="text-xs font-bold text-muted-foreground">
                    Gain{point.isPriceFallback ? " (panier moyen)" : ""}
                  </p>
                  <p className="mt-1 font-display text-xl font-bold">
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

            {index === 0 && (
              <div className="flex items-center gap-3 border-t border-accent/20 pt-4">
                <Falco pose="alert" size="xs" animate="enter" />
                <FalcoBubble arrow="left" className="max-w-none flex-1">
                  C&apos;est mon conseil n°1 — attaque celui-là en premier, c&apos;est là qu&apos;est le plus gros levier.
                </FalcoBubble>
              </div>
            )}

            <a href={`#metric-${point.key}`} className="self-start text-sm font-bold text-muted-foreground hover:underline">
              Voir le détail
            </a>
          </div>
        ))}
      </div>

      {topDiscoveryOpportunities.length > 0 && (
        <div className="flex flex-col gap-4">
          <h2 className="text-base font-bold">Et si tu ajoutais ça ?</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {topDiscoveryOpportunities.map((opportunity) => (
              <DiscoveryOpportunityCard
                key={opportunity.leverKey}
                leverKey={opportunity.leverKey}
                label={opportunity.label}
                category={opportunity.category}
                effort={opportunity.effort}
                impactAmountEur={opportunity.impactAmountEur}
                impactExplanation={opportunity.impactExplanation}
                ctaLabel="Mettre en place"
              />
            ))}
          </div>
        </div>
      )}

      {/* Bloc 3 — La vue complète */}
      <div>
        <h2 className="text-base font-bold">Tout ton business en un coup d&apos;œil</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <div key={summary.key} id={`metric-${summary.key}`} className="sticker-card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{summary.label}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE[summary.status])}>
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
                <p className="text-sm font-bold">{summary.label}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE[summary.status])}>
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

          {followups.map((followup) => (
            <div key={followup.key} className="sticker-card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{followup.label}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE[followup.status])}>
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
        <p className="text-sm font-bold">Et si tu corrigeais tout ?</p>
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
