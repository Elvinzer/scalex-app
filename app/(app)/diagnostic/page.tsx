import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";

import { AutoOpenImprove } from "./auto-open-improve";
import { DiscoveryOpportunityCard } from "./discovery-opportunity-card";
import { getDiscoveryProgress } from "./discovery-actions";
import { DiscoveryTab } from "./discovery-tab";
import { OptimisationEntryCard } from "./optimisation-entry-card";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";
import { scoreCandidates } from "@/lib/diagnostic/priority";
import { getPriorityRules } from "@/lib/diagnostic/priority-rules";
import { BusinessNudgeBanner } from "@/components/business-nudge-banner";
import { Falco } from "@/components/falco/falco";
import { FalcoBubble } from "@/components/falco/falco-bubble";
import { CalcPopover } from "@/components/calc-popover";
import { MetricSummaryCard } from "@/components/metric-summary-card";
import { OverviewActiveLeverCard } from "@/components/overview-active-lever-card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { RateVsBenchmarkBar } from "@/components/rate-vs-benchmark-bar";
import { Button } from "@/components/ui/button";
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
  computeHealthScore,
  computeMetricSummaries,
} from "@/lib/diagnostic/cascade";
import { adviceFor } from "@/lib/diagnostic/lever-advice";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { computeFollowupCompliance } from "@/lib/diagnostic/followups";
import { formatEur } from "@/lib/currency";
import { getContentPosts } from "@/lib/content-posts/queries";
import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { cn } from "@/lib/utils";

type DiagnosticTab = "overview" | "discovery";

function resolveTab(value: string | undefined): DiagnosticTab {
  return value === "discovery" ? value : "overview";
}

const PERIOD_LABELS: Record<string, string> = {
  "3-months": "3 derniers mois",
  "current-month": "mois en cours",
  "12-months": "12 mois",
};

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
    // Set by clicking Section 1's "Améliorer ça →" CTA (components/priority-item.tsx's
    // pattern, reused inline below) — read here only to detect the click
    // server-side for diagnostic_optimize_clicked; AutoOpenImprove still
    // owns actually opening the drawer from these same params.
    open?: string;
    openLever?: string;
  }>;
}) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "diagnostic");
  const params = await searchParams;
  const tab = resolveTab(params.tab);
  after(() => track("diagnostic_viewed", userId));
  const period = params.period && PERIOD_LABELS[params.period] ? params.period : "3-months";
  const discoveryProgress = await getDiscoveryProgress(accountId);
  const discoveryRemaining = discoveryProgress.total - discoveryProgress.answered;

  const overviewHeader = (
    <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Ton diagnostic</h1>
  );

  if (tab === "discovery") {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">Optimisation</h1>
          <Link href="/diagnostic" className="text-sm font-bold text-muted-foreground hover:underline">
            ← Retour au diagnostic
          </Link>
        </div>
        <DiscoveryTab accountId={accountId} />
      </div>
    );
  }

  const businessProfile = await getBusinessProfile(accountId);

  const [{ allSettingEntries, allClosingEntries, allMonthlyRows }, allContentPosts] = await Promise.all([
    getDiagnosticKpiRawData(accountId),
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
        {overviewHeader}
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

  const [benchmarks, contentBenchmarks, priorityRules] = await Promise.all([
    getDiagnosticBenchmarks(user?.sector ?? null),
    getContentDiagnosticBenchmarks(user?.sector ?? null),
    getPriorityRules(),
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
  const { toImplement: discoveryOpportunities, toWatch, strong } = await computeLeverOpportunities({
    accountId,
    businessProfile,
    settingTotals,
    closingTotals,
    cashContractedTotal,
    periodMonths: months.length,
    months,
  });

  const monthlyRevenueEur = cashContractedTotal / months.length;

  // Active-only lever candidates — Optimiser NEVER surfaces an absent
  // lever (that's Ajouter's job). `leverKey` gets a `:statKey` suffix ONLY
  // when a lever has more than one stat checked (email_marketing's ctr
  // alongside its openRate — see lib/levers/opportunities.ts) so both
  // entries get distinct scoring/list identity; the CTA still opens the
  // real lever's agent (read from watchItem.leverKey below, never this
  // composite string).
  const activeLeverCandidates = toWatch.map((watch) => ({
    leverKey: watch.statKey ? `${watch.leverKey}:${watch.statKey}` : watch.leverKey,
    label: watch.label,
    category: watch.category,
    impactAmountEur: watch.impactAmountEur,
    effort: "faible" as const, // no per-lever effort exists once already active — same calibration Dashboard uses for the identical case
    healthScore: watch.score,
    isActive: true,
  }));

  // Section 1's full unified list — cascade points + active-but-underperforming
  // levers, ranked by the exact same gain×pertinence×faisabilité formula
  // (lib/diagnostic/priority.ts), never a raw €-sort. Keyed by the same
  // composite string as activeLeverCandidates above (a plain leverKey Map
  // would silently drop one of email's two entries).
  const watchByKey = new Map(toWatch.map((watch) => [watch.statKey ? `${watch.leverKey}:${watch.statKey}` : watch.leverKey, watch]));
  const optimizeList = scoreCandidates({
    points,
    leverCandidates: activeLeverCandidates,
    businessProfile,
    monthlyRevenueEur,
    rules: priorityRules,
  });

  // Content (vues→lead) has no €/client formula anywhere by deliberate,
  // documented design (lib/diagnostic/content-metrics.ts) — it can't enter
  // scoreCandidates (which requires a monthly gain to normalize against),
  // so these are appended after the scored list instead of inventing a
  // number. Still real getHealthTier tiers via computeHealthScore, same as
  // every other card.
  const contentPoints = contentSummaries.filter(
    (s): s is typeof s & { status: "caution" | "critical"; currentRatePercent: number } =>
      (s.status === "caution" || s.status === "critical") && s.currentRatePercent !== null
  );

  // Section 2 — same formula, absent levers only (isActive: false), so the
  // existing pertinence rules (lever_revenue_gate/lever_requires_main_offer
  // — e.g. "ne pas proposer les ads sans budget") shape the sort order
  // instead of a raw impact-only sort.
  const addList = scoreCandidates({
    points: [],
    leverCandidates: discoveryOpportunities.map((opportunity) => ({
      leverKey: opportunity.leverKey,
      label: opportunity.label,
      category: opportunity.category,
      impactAmountEur: opportunity.impactAmountEur,
      effort: opportunity.effort,
      healthScore: 0,
      isActive: false,
    })),
    businessProfile,
    monthlyRevenueEur,
    rules: priorityRules,
  });
  const addByKey = new Map(discoveryOpportunities.map((o) => [o.leverKey, o]));

  const strongCount = summaries.filter((s) => s.status === "ok").length + strong.length;

  after(() => track("diagnostic_points_viewed", userId, { count: optimizeList.length + contentPoints.length }));
  after(() => track("diagnostic_add_viewed", userId, { opportunities_count: addList.length }));
  // The CTA in Section 1 is a plain <a href="/diagnostic?open=..."> (or
  // ?openLever=...) — clicking it reloads this exact page, so the click is
  // observable server-side on the very next render, no client wiring needed.
  if (params.open || params.openLever) {
    after(() => track("diagnostic_point_clicked", userId, { lever: params.open ?? params.openLever ?? "" }));
  }

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
  // Falco on this screen).
  const verdictLine =
    topPoints.length > 0
      ? `J'ai repéré ton goulot : ${topPoints[0].label}${totalMonthlyGain !== null ? `, ≈${formatEur(totalMonthlyGain)}/mois à récupérer` : ""}.`
      : "Tes taux mesurés sont au niveau du benchmark. Solide.";

  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AutoOpenImprove />
      </Suspense>

      {overviewHeader}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <Falco
          skin="diagnostic"
          skinSizePx={80}
          animate="enter"
          withBubble
          bubbleText={verdictLine}
          className="max-w-full"
          bubbleClassName="max-w-md"
        />
        <div className="flex gap-2">
          {Object.entries(PERIOD_LABELS).map(([value, label]) => (
            <Link
              key={value}
              href={`/diagnostic?period=${value}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-bold transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)]",
                // Soft tint for the selected filter, not a solid coral fill —
                // coral stays reserved for the page's one priority CTA.
                period === value
                  ? "border-accent-border bg-accent-soft text-accent-text"
                  : "border-border text-muted-foreground hover:border-border-hover"
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {isThin && <BusinessNudgeBanner />}

      {/* ============================= SECTION 1 — OPTIMISER ============================= */}
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-lg font-bold">Optimise ce que tu fais déjà</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tes leviers actifs, comparés au benchmark de ta niche.</p>
        </div>

        {/* Le total "Optimiser" — calculé uniquement sur les 3 premiers points
            cascade, ouverture visuelle de cette section. */}
        <div className="sticker-spotlight animate-rise px-7 py-6">
          <p className="text-xs text-mist/70">Potentiel total détecté</p>
          <p className="figure-hero gradient-text mt-2">
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

        <div id="points-a-ameliorer" className="flex flex-col gap-4">
          <h3 className="text-base font-bold">Points à améliorer</h3>
          {optimizeList.length === 0 && contentPoints.length === 0 && (
            <div className="sticker-card-dashed flex flex-col items-center gap-3 p-6 text-center">
              <Falco
                pose="happy"
                size="md"
                animate="enter"
                withBubble
                bubbleText="Tes leviers actifs sont solides. Regarde du côté d'Ajouter pour la suite."
                bubbleSide="left"
              />
            </div>
          )}
          {optimizeList.map((recommendation, index) => {
            const { candidate } = recommendation;
            const tier = getHealthTier(candidate.healthScore);
            const isLever = candidate.type === "lever";
            const watchItem = isLever ? watchByKey.get(candidate.key) : undefined;
            const currentRate = isLever ? (watchItem?.statValue ?? null) : candidate.sourceMetricPoint!.currentRatePercent / 100;
            const benchmarkRate = isLever ? (watchItem?.benchmarkValue ?? null) : candidate.sourceMetricPoint!.benchmarkRatePercent / 100;
            // Levers show a NEW deterministic advice sentence (adviceFor) as
            // the body text — the € breakdown (impactExplanation) moves into
            // the CalcPopover only, so the two don't repeat each other.
            // Metric points keep their existing explanation as-is (already
            // factual/actionable, no new template needed for those).
            const advice = isLever
              ? adviceFor(watchItem!.leverKey, watchItem!.statKey, Math.round(currentRate! * 100), Math.round(benchmarkRate! * 100), "Falco")
              : candidate.sourceMetricPoint!.explanation;
            const tooltip = isLever ? (watchItem?.impactExplanation ?? "") : candidate.sourceMetricPoint!.tooltip;
            const href = isLever
              ? `/diagnostic?openLever=${watchItem!.leverKey}&openLeverLabel=${encodeURIComponent(candidate.label)}`
              : `/diagnostic?open=${candidate.key}`;

            return (
              <div
                key={`${candidate.type}-${candidate.key}`}
                className={cn(
                  "sticker-card animate-rise flex flex-col gap-4 p-6",
                  index === 0 && "border-accent/40 bg-linear-to-br from-accent-soft to-transparent"
                )}
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 rounded-full px-2 py-0.5 text-xs font-bold"
                      style={{ background: `${tier.colorBar}22`, color: tier.colorText }}
                    >
                      {tier.tier === "vert" ? "✅" : tier.tier === "ambre" ? "⚠️" : "❌"}
                    </span>
                    <div>
                      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                        #{index + 1} · {candidate.category}
                      </p>
                      <p className="mt-0.5 font-bold">{candidate.label}</p>
                    </div>
                  </div>
                </div>

                {currentRate !== null && benchmarkRate !== null && (
                  <RateVsBenchmarkBar currentRate={currentRate} benchmarkRate={benchmarkRate} />
                )}

                <div className="grid grid-cols-2 gap-4">
                  {candidate.extraClientsPerMonth !== null ? (
                    <div className="rounded-xl bg-muted p-3">
                      <p className="text-xs font-bold text-muted-foreground">Clients en plus</p>
                      <p className="mt-1 font-display text-xl font-bold tabular-nums">+{candidate.extraClientsPerMonth}/mois</p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-muted p-3">
                      <p className="text-xs font-bold text-muted-foreground">Statut</p>
                      <p className="mt-1 text-sm font-bold">{candidate.isActive ? "En place, sous le benchmark" : "—"}</p>
                    </div>
                  )}
                  <div className="flex items-start justify-between rounded-xl bg-muted p-3">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground">Gain</p>
                      <p className="mt-1 font-display text-xl font-bold tabular-nums">+{formatEur(candidate.monthlyGainEur)}/mois</p>
                    </div>
                    <CalcPopover explanation={tooltip} />
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">{advice}</p>

                {index === 0 && (
                  <div className="flex items-center gap-3 border-t border-accent/20 pt-4">
                    <Falco pose="alert" size="xs" animate="enter" />
                    <FalcoBubble arrow="left" className="max-w-none flex-1">
                      C&apos;est mon conseil n°1 : attaque celui-là en premier, c&apos;est là qu&apos;est le plus gros levier.
                    </FalcoBubble>
                  </div>
                )}

                <a href={href} className="self-start text-sm font-bold text-muted-foreground hover:underline">
                  Voir le détail
                </a>
              </div>
            );
          })}

          {/* Contenu (vues→lead) — pas de € (design assumé, voir contentPoints
              plus haut), donc jamais scoré/trié avec le reste : ajouté après,
              dans son propre ordre (par écart au benchmark décroissant). */}
          {[...contentPoints]
            .sort((a, b) => b.benchmarkRatePercent - b.currentRatePercent - (a.benchmarkRatePercent - a.currentRatePercent))
            .map((summary, contentIndex) => {
              const score = computeHealthScore(summary.currentRatePercent / 100, summary.benchmarkRatePercent / 100, summary.status);
              const tier = getHealthTier(score);
              const advice = adviceFor(summary.key, undefined, summary.currentRatePercent, summary.benchmarkRatePercent, "Falco");

              return (
                <div key={summary.key} className="sticker-card animate-rise flex flex-col gap-4 p-6">
                  <div className="flex items-start gap-3">
                    <span
                      className="mt-0.5 rounded-full px-2 py-0.5 text-xs font-bold"
                      style={{ background: `${tier.colorBar}22`, color: tier.colorText }}
                    >
                      {tier.tier === "vert" ? "✅" : tier.tier === "ambre" ? "⚠️" : "❌"}
                    </span>
                    <div>
                      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
                        #{optimizeList.length + contentIndex + 1} · {summary.category}
                      </p>
                      <p className="mt-0.5 font-bold">{summary.label}</p>
                    </div>
                  </div>

                  <RateVsBenchmarkBar currentRate={summary.currentRatePercent / 100} benchmarkRate={summary.benchmarkRatePercent / 100} />

                  <div className="rounded-xl bg-muted p-3">
                    <p className="text-xs font-bold text-muted-foreground">Gain</p>
                    <p className="mt-1 font-display text-xl font-bold tabular-nums">—</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Pas de simulation € pour le contenu.</p>
                  </div>

                  <p className="text-sm text-muted-foreground">{advice}</p>

                  <a
                    href={`/diagnostic?openLever=content&openLeverLabel=${encodeURIComponent("Contenu")}`}
                    className="self-start text-sm font-bold text-muted-foreground hover:underline"
                  >
                    Voir le détail
                  </a>
                </div>
              );
            })}
        </div>

        {strongCount > 0 && (
          <Accordion type="single" collapsible>
            <AccordionItem value="points-forts" className="sticker-card-dashed rounded-xl border-0 px-5">
              <AccordionTrigger>
                <span className="rounded-full bg-state-healthy-bg px-2 py-0.5 text-xs font-bold text-state-healthy">
                  Tes points forts ({strongCount}) ▸
                </span>
              </AccordionTrigger>
              <AccordionContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {summaries
                  .filter((s) => s.status === "ok")
                  .map((summary) => (
                    <MetricSummaryCard
                      key={summary.key}
                      summary={summary}
                      measureHint={MEASURE_HINTS[summary.key]}
                      measureHintHref="/datas"
                      measureHintLabel="Aller sur Datas →"
                    />
                  ))}
                {strong.map((item) => (
                  <OverviewActiveLeverCard
                    key={item.leverKey}
                    label={item.label}
                    category={item.category}
                    statValue={item.statValue}
                    benchmarkValue={item.benchmarkValue}
                    score={item.score}
                  />
                ))}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>

      {/* ============================== SECTION 2 — AJOUTER ============================== */}
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-lg font-bold">Ce que tu pourrais ajouter</h2>
          <p className="mt-1 text-sm text-muted-foreground">Des leviers que tu n&apos;exploites pas encore, classés par potentiel.</p>
        </div>

        {addList.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {addList.map(({ candidate }) => {
              const opportunity = addByKey.get(candidate.key)!;
              return (
                <DiscoveryOpportunityCard
                  key={opportunity.leverKey}
                  leverKey={opportunity.leverKey}
                  label={opportunity.label}
                  category={opportunity.category}
                  effort={opportunity.effort}
                  impactAmountEur={opportunity.impactAmountEur}
                  impactExplanation={opportunity.impactExplanation}
                  ctaLabel="Démarrer avec Falco →"
                  sourcePage="diagnostic_overview"
                  mode="demarrer"
                />
              );
            })}
          </div>
        ) : (
          <div className="sticker-card-dashed p-6 text-center text-sm text-muted-foreground">
            Aucun levier supplémentaire identifié pour l&apos;instant.
          </div>
        )}

        {discoveryRemaining > 0 && (
          <OptimisationEntryCard
            answered={discoveryProgress.answered}
            total={discoveryProgress.total}
            remaining={discoveryRemaining}
          />
        )}
      </div>

      {/* Bloc 3 — La vue complète */}
      <div>
        <h2 className="text-base font-bold">Tout ton business en un coup d&apos;œil</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <MetricSummaryCard
              key={summary.key}
              summary={summary}
              measureHint={MEASURE_HINTS[summary.key]}
              measureHintHref="/datas"
              measureHintLabel="Aller sur Datas →"
            />
          ))}

          {contentSummaries.map((summary) => (
            <MetricSummaryCard
              key={summary.key}
              summary={summary}
              measureHint={MEASURE_HINTS[summary.key]}
              measureHintHref="/acquisition/contenu"
              measureHintLabel="Aller sur Contenu →"
            />
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
          Projection si tout est au benchmark en même temps, différente de la somme des points ci-dessus (les
          améliorations se multiplient entre elles).
        </p>
      </div>
    </div>
  );
}
