import Link from "next/link";
import { after } from "next/server";
import { Suspense } from "react";

import { AutoOpenImprove } from "../diagnostic/auto-open-improve";
import { DiscoveryOpportunityCard } from "../diagnostic/discovery-opportunity-card";
import { getDiscoveryProgress } from "../diagnostic/discovery-actions";
import { DiscoveryTab } from "../diagnostic/discovery-tab";
import { OptimisationEntryCard } from "../diagnostic/optimisation-entry-card";
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
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import {
  activeContentMetricKeys,
  activeLegacyMetricKeys,
  normalizeAcquisitionSelection,
} from "@/lib/acquisition-funnels/selection";
import { isBusinessProfileThin } from "@/lib/business/thinness";
import { track } from "@/lib/analytics";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import {
  aggregateContentTotals,
  computeContentMetricSummaries,
} from "@/lib/diagnostic/content-metrics";
import { filterVisibleContentPosts } from "@/lib/content-posts/visibility";
import { getContentDiagnosticBenchmarks } from "@/lib/diagnostic/content-benchmarks";
import { computeContentRetentionSummary } from "@/lib/diagnostic/content-retention";
import { currentMonthWindow, lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import {
  buildRates,
  computeDiagnosticPoints,
  computeFullBenchmarkProjection,
  computeHealthScore,
  computeMetricSummaries,
  resolveDealPrice,
} from "@/lib/diagnostic/cascade";
import { computeContentGain } from "@/lib/diagnostic/content-gain";
import { adviceFor } from "@/lib/diagnostic/lever-advice";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { computeFollowupCompliance } from "@/lib/diagnostic/followups";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { getTestimonialProof } from "@/lib/deliverability/queries";
import { cn } from "@/lib/utils";
import { measureAsync } from "@/lib/perf/timing";
import { InsightHistorySection } from "@/components/insight-execution/insight-history-section";
import { QuickInsightLaunchButton } from "@/components/insight-execution/quick-insight-launch-button";
import { getLocale, getTranslations } from "next-intl/server";
import { FunnelSequenceOverview } from "@/components/funnel-sequence-overview";
import { getFunnelBlockBenchmarks, getFunnelBlockCatalog } from "@/lib/funnel-blocks/queries";
import { normalizeFunnelBlockSelection } from "@/lib/funnel-blocks/selection";
import { isFunnelSourceKey, type FunnelSourceKey } from "@/lib/funnel-blocks/types";

type DiagnosticTab = "overview" | "discovery";

function resolveTab(value: string | undefined): DiagnosticTab {
  return value === "discovery" ? value : "overview";
}

const PERIOD_VALUES = new Set(["3-months", "current-month", "12-months"]);

const STATUS_BADGE: Record<string, string> = {
  ok: "bg-state-healthy-bg text-state-healthy",
  caution: "bg-state-caution-bg text-state-caution",
  critical: "bg-state-critical-bg text-state-critical",
  unmeasured: "bg-muted text-muted-foreground",
};

const MEASURE_HINTS: Record<string, string> = {
  responseRate: "responseRate",
  proposalRate: "proposalRate",
  bookingRate: "bookingRate",
  showUpRate: "showUpRate",
  closingRate: "closingRate",
  content_click_rate: "contentClickRate",
  content_lead_rate: "contentLeadRate",
  content_booking_rate: "contentBookingRate",
  content_close_rate: "contentCloseRate",
};

const LEVER_LABEL_KEYS: Record<string, string> = {
  lead_magnet: "leadMagnet",
  email_marketing: "emailMarketing",
  newsletter: "newsletter",
  seo_blog: "seoBlog",
  podcast: "podcast",
  retargeting: "retargeting",
  referral: "referral",
  ads: "ads",
  vsl: "vsl",
  webinar: "webinar",
  sequence_relance_non_acheteurs: "nonBuyerFollowup",
  order_bump: "orderBump",
  downsell: "downsell",
  garantie: "guarantee",
  preuve_sociale_page: "socialProof",
  upsell_ascension: "upsell",
  onboarding_structure: "onboarding",
  collecte_temoignages_systematique: "testimonials",
  communaute_clients: "community",
  reactivation_anciens_clients: "reactivation",
};

type DiagnosticPageProps = {
  searchParams: Promise<{
    period?: string;
    tab?: string;
    source?: string;
    // Set by clicking Section 1's "Améliorer ça →" CTA (components/priority-item.tsx's
    // pattern, reused inline below) — read here only to detect the click
    // server-side for diagnostic_optimize_clicked; AutoOpenImprove still
    // owns actually opening the drawer from these same params.
    open?: string;
    openLever?: string;
  }>;
};

export default function DiagnosticPage(props: DiagnosticPageProps) {
  return measureAsync("page.diagnostic", () => renderDiagnosticPage(props));
}

async function renderDiagnosticPage({
  searchParams,
}: DiagnosticPageProps) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "diagnostic");
  const params = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations("diagnostic");
  const tab = resolveTab(params.tab);
  after(() => track("diagnostic_viewed", userId));
  const period = params.period && PERIOD_VALUES.has(params.period) ? params.period : "3-months";
  const measureHint = (key: string) => {
    const hintKey = MEASURE_HINTS[key];
    return hintKey ? t(`measureHints.${hintKey}`) : undefined;
  };
  const localizedMetricLabel = (key: string) => t(`metrics.${key}`);
  const localizedContentMetricLabel = (key: string) => t(`contentMetrics.${key}`);
  const localizedLeverLabel = (key: string, fallback: string) => {
    const labelKey = LEVER_LABEL_KEYS[key];
    return labelKey ? t(`levers.${labelKey}`) : fallback;
  };
  const localizedCategory = (category: string) => {
    const normalized = category.toLowerCase();
    return t(`categories.${normalized === "contenu" ? "content" : normalized}`);
  };
  const localizedFollowupLabel = (key: string, fallback: string) => t(`followups.${key}`) || fallback;
  const overviewHeader = (
    <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{t("title")}</h1>
  );

  if (tab === "discovery") {
    return (
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* "Découverte", pas "Optimisation" — la vue par défaut du
              diagnostic dit déjà "Optimise ce que tu fais déjà" en Section 1;
              garder le même mot ici pour un questionnaire qui sert à révéler
              des leviers non configurés créait une collision de nom. */}
          <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{t("discoveryTab")}</h1>
          <Link href="/diagnostic-app" className="text-sm font-bold text-muted-foreground hover:underline">
            {t("back")}
          </Link>
        </div>
        <DiscoveryTab accountId={accountId} />
      </div>
    );
  }

  const [businessProfile, rawData, discoveryProgress, acquisitionCatalog, funnelBlockCatalog, testimonialProof] = await Promise.all([
    getBusinessProfile(accountId),
    getDiagnosticKpiRawData(accountId),
    getDiscoveryProgress(accountId),
    getAcquisitionFunnelCatalog(),
    getFunnelBlockCatalog(),
    getTestimonialProof(accountId),
  ]);
  const acquisitionSelection = normalizeAcquisitionSelection(businessProfile.acquisition, acquisitionCatalog);
  const funnelBlockSelection = normalizeFunnelBlockSelection(businessProfile.acquisition, funnelBlockCatalog);
  const funnelBlockBenchmarks = await getFunnelBlockBenchmarks(funnelBlockSelection.blocks.map((item) => item.blockKey), user?.sector ?? null);
  const source: FunnelSourceKey | "total" = isFunnelSourceKey(params.source) ? params.source : "total";
  if (source !== "total") after(() => track("source_filter_used", userId, { source, page: "diagnostic" }));
  const activeLegacyKeys = activeLegacyMetricKeys(acquisitionSelection, acquisitionCatalog);
  const activeContentKeys = activeContentMetricKeys(acquisitionSelection, acquisitionCatalog);
  const { allSettingEntries, allClosingEntries, allMonthlyRows, allCallSourcesByMonth, allSales, allLeads, allLeadStageHistory, allContentPosts, allVideoAttributionTotals, allEmailCampaigns, allMetaMetrics, allNativeBookingLeads } = rawData;
  const discoveryRemaining = discoveryProgress.total - discoveryProgress.answered;

  const months = period === "current-month" ? [currentMonthWindow()] : lastCompletedMonths(period === "12-months" ? 12 : 3);

  const { settingTotals, closingTotals, cashContractedTotal, hasAnySourceData } = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
    callSourcesByMonth: allCallSourcesByMonth,
    allSales,
    allLeads,
    allLeadStageHistory,
    allEmailCampaigns,
    allMetaMetrics,
    allNativeBookingLeads,
  });

  if (!hasAnySourceData) {
    return (
      <div className="flex flex-col gap-8">
        {overviewHeader}
        <InsightHistorySection accountId={accountId} viewerUserId={userId} canAssign={userId === accountId} />
        <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="max-w-md text-muted-foreground">
            {t("noData")}
          </p>
          <Button size="lg" asChild className="mt-2">
            <Link href="/datas" prefetch={true}>{t("fillData")}</Link>
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

  const visibleContentPosts = filterVisibleContentPosts(allContentPosts, rawData.allYoutubeVideoInsights);
  const contentTotals = aggregateContentTotals(months, visibleContentPosts, allVideoAttributionTotals);
  const contentRetention = computeContentRetentionSummary({
    months,
    youtubeVideos: rawData.allYoutubeVideoInsights,
    instagramPosts: rawData.allInstagramPostInsights,
  });
  // Same price the cascade points are valued with — one resolution, so a
  // content gain and a funnel gain are never priced differently.
  const contentDealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const funnelRates = buildRates(settingTotals, closingTotals);
  const contentSummaries = computeContentMetricSummaries({
    totals: contentTotals,
    benchmarks: contentBenchmarks,
    activeMetricKeys: activeContentKeys,
  });
  const points = computeDiagnosticPoints({
    settingTotals,
    closingTotals,
    benchmarks,
    businessProfile,
    cashContractedTotal,
    activeMetricKeys: activeLegacyKeys,
  });
  const summaries = computeMetricSummaries({ settingTotals, closingTotals, benchmarks, activeMetricKeys: activeLegacyKeys });
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
  const contentPoints = contentSummaries
    .filter(
      (s): s is typeof s & { status: "caution" | "critical"; currentRatePercent: number } =>
        (s.status === "caution" || s.status === "critical") && s.currentRatePercent !== null
    )
    // Every point now carries its own € — computed from the account's real
    // rates where they exist, the niche benchmark only as a named stand-in
    // (lib/diagnostic/content-gain.ts). Sorted by that gain rather than by
    // raw benchmark gap: a 3-point gap on a metric worth 4k€ has to come
    // before a 20-point gap worth 200€.
    .map((summary) => ({
      summary,
      gain: computeContentGain({
        metricKey: summary.key,
        totals: contentTotals,
        contentBenchmarks,
        funnelRates,
        funnelBenchmarks: benchmarks,
        dealPrice: contentDealPrice,
        locale,
      }),
    }))
    .sort((a, b) => (b.gain.monthlyGain ?? 0) - (a.gain.monthlyGain ?? 0));

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

  // Under benchmark, but no € could be attached (no offer price, no sale
  // closed) — see the empty state below.
  const unpricedPoints = points.filter((point) => point.monthlyGain === null);

  const strongCount = summaries.filter((s) => s.status === "ok").length + strong.length;

  after(() => track("diagnostic_points_viewed", userId, { count: optimizeList.length + contentPoints.length }));
  after(() => track("diagnostic_add_viewed", userId, { opportunities_count: addList.length }));
  // The CTA in Section 1 is a plain <a href="/diagnostic-app?open=..."> (or
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
    activeMetricKeys: activeLegacyKeys,
  });

  const topPoints = points.slice(0, 3);
  const totalExtraClients = Math.round(topPoints.reduce((sum, p) => sum + p.extraClients, 0) * 10) / 10;
  const totalMonthlyGain = topPoints.some((p) => p.monthlyGain === null)
    ? null
    : topPoints.reduce((sum, p) => sum + (p.monthlyGain ?? 0), 0);
  const isThin = isBusinessProfileThin(businessProfile);

  // Falco's one-line verdict for the overview header (the single content
  // Falco on this screen).
  const verdictLine =
    topPoints.length > 0
      ? t("verdictWithBottleneck", {
          label: localizedMetricLabel(topPoints[0].key),
          amount: totalMonthlyGain !== null ? `, ≈${formatEur(totalMonthlyGain, locale)}${t("perMonthToRecover")}` : "",
        })
      : t("verdictSolid");

  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <AutoOpenImprove />
      </Suspense>

      {overviewHeader}

      <section id="diagnostic-spotlight" className="sticker-spotlight flex flex-col gap-5 px-7 py-6 sm:flex-row sm:items-end sm:justify-between" aria-labelledby="diagnostic-spotlight-heading">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-mist/70 uppercase">{t("mainBottleneck")}</p>
          <h2 id="diagnostic-spotlight-heading" className="mt-2 max-w-xl text-2xl font-bold">{topPoints[0] ? localizedMetricLabel(topPoints[0].key) : t("noMeasurableBottleneck")}</h2>
          <p className="mt-2 max-w-xl text-sm text-mist/70">
            {topPoints[0]
              ? t("spotlightSummary", {
                  current: topPoints[0].currentRatePercent,
                  benchmark: topPoints[0].benchmarkRatePercent,
                  clients: topPoints[0].extraClients,
                  plural: topPoints[0].extraClients > 1 ? "s" : "",
                })
              : t("reliableGap")}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button asChild>
              <a href="#points-a-ameliorer">{t("treatPriority")}</a>
            </Button>
            <a href="#calcul" className="text-sm font-bold text-mist/70 underline-offset-4 hover:text-text-on-dark hover:underline">{t("calculatedHow")}</a>
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-xs font-bold text-mist/70">{t("estimatedGap")}</p>
          <p className="mt-1 font-display text-4xl font-bold tabular-nums">{totalMonthlyGain === null ? "—" : `+${formatEur(totalMonthlyGain, locale)}`}</p>
          <p className="mt-1 text-xs text-mist/60">{t("perMonthCalculated")}</p>
        </div>
      </section>

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
          {[...PERIOD_VALUES].map((value) => (
            <Link
              key={value}
              href={`/diagnostic-app?period=${value}`}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm font-bold transition-all duration-[var(--motion-fast)] ease-[var(--ease-out)]",
                // Soft tint for the selected filter, not a solid coral fill —
                // coral stays reserved for the page's one priority CTA.
                period === value
                  ? "border-accent-border bg-accent-soft text-accent-text"
                  : "border-border text-muted-foreground hover:border-border-hover"
              )}
            >
              {t(`period.${value}`)}
            </Link>
          ))}
        </div>
      </div>

      <FunnelSequenceOverview
        selection={funnelBlockSelection}
        catalog={funnelBlockCatalog}
        benchmarks={funnelBlockBenchmarks}
        currentRow={allMonthlyRows.find((row) => row.year === currentMonthWindow().year && row.month === currentMonthWindow().month) ?? null}
        monthlyRows={allMonthlyRows}
        source={source}
      />

      <section className="sticker-card flex flex-col gap-4 border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between" aria-labelledby="testimonial-proof-heading">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">{t("deliveryProof.title")}</p>
          <h2 id="testimonial-proof-heading" className="mt-1 text-lg font-bold">{t("deliveryProof.count", { count: testimonialProof.count })}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t(`deliveryProof.status.${testimonialProof.status}`)}</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/delivrabilite/temoignages">{t("deliveryProof.cta")}</Link>
        </Button>
      </section>

      {isThin && <BusinessNudgeBanner />}

      <section aria-labelledby="insight-history-heading">
        <InsightHistorySection accountId={accountId} viewerUserId={userId} canAssign={userId === accountId} />
      </section>

      {/* ============================= SECTION 1 — OPTIMISER ============================= */}
      <div className="flex flex-col gap-8">
        <div>
          <h2 className="text-lg font-bold">{t("optimizeTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("optimizeHelp")}</p>
        </div>

        {/* Le total "Optimiser" — calculé uniquement sur les 3 premiers points
            cascade, ouverture visuelle de cette section. */}
        <div id="calcul" className="sticker-card-dashed animate-rise px-7 py-6">
          <p className="text-xs text-muted-foreground">{t("totalPotential")}</p>
          <p className="mt-2 font-display text-3xl font-bold">
            {totalMonthlyGain === null ? "—" : `${formatEur(totalMonthlyGain, locale)}${t("perMonthSuffix")}`}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("extraClients", { count: totalExtraClients, points: topPoints.length })}
          </p>
          <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            {contentDealPrice.source === "main_offer" ? (
              <span>
                {t("withOffer", { offer: contentDealPrice.offerName || "main", price: formatEur(contentDealPrice.price as number, locale) })}
              </span>
            ) : contentDealPrice.source === "average_basket" ? (
              <span>{t("withAverageBasket")}</span>
            ) : contentDealPrice.source === "offer_average" ? (
              <span>
                {t("withOfferAverage", { price: formatEur(Math.round(contentDealPrice.price as number), locale) })}
              </span>
            ) : (
              <span>{t("noPrice")}</span>
            )}
            <CalcPopover explanation={t("calculationExplanation")} />
          </div>
        </div>

        <div id="points-a-ameliorer" className="flex flex-col gap-4">
          <h3 className="text-base font-bold">{t("pointsToImprove")}</h3>
          {/* A point with no resolvable € is dropped by scoreCandidates
              (it has nothing to normalise against), so without this the
              section would congratulate the user while real metrics sit
              under the benchmark. Naming them + the one field that unlocks
              the figure beats both a silent drop and a fake number. */}
          {optimizeList.length === 0 && contentPoints.length === 0 && unpricedPoints.length > 0 && (
            <div className="sticker-card-dashed flex flex-col gap-3 p-6">
              <p className="text-sm font-bold">
                {t("unpricedPoints", { count: unpricedPoints.length, plural: unpricedPoints.length > 1 ? "s" : "" })}
              </p>
              <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
                {unpricedPoints.map((point) => (
                  <li key={point.key}>
                    {localizedMetricLabel(point.key)} — {point.currentRatePercent}% vs benchmark {point.benchmarkRatePercent}%
                  </li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">
                {t("unpricedHelp")}
              </p>
              <Button asChild variant="outline" className="self-start">
                <Link href="/business#offres">{t("addOfferPrice")}</Link>
              </Button>
            </div>
          )}
          {optimizeList.length === 0 && contentPoints.length === 0 && unpricedPoints.length === 0 && (
            <div className="sticker-card-dashed flex flex-col items-center gap-3 p-6 text-center">
              <Falco
                pose="happy"
                size="md"
                animate="enter"
                withBubble
                bubbleText={t("solidBubble")}
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
            const displayLabel = isLever ? localizedLeverLabel(candidate.key, candidate.label) : localizedMetricLabel(candidate.key);
            const displayCategory = localizedCategory(candidate.category);
            // Levers show a NEW deterministic advice sentence (adviceFor) as
            // the body text — the € breakdown (impactExplanation) moves into
            // the CalcPopover only, so the two don't repeat each other.
            // Metric points keep their existing explanation as-is (already
            // factual/actionable, no new template needed for those).
            const advice = isLever
              ? adviceFor(watchItem!.leverKey, watchItem!.statKey, Math.round(currentRate! * 100), Math.round(benchmarkRate! * 100), "Falco", locale)
              : t(`metricExplanations.${candidate.key}`, {
                  current: candidate.sourceMetricPoint!.currentRatePercent,
                  benchmark: candidate.sourceMetricPoint!.benchmarkRatePercent,
                  gain: candidate.sourceMetricPoint!.extraClients,
                  noShow: 100 - candidate.sourceMetricPoint!.currentRatePercent,
                });
            const tooltip = isLever
              ? (watchItem?.impactExplanation ?? "")
              : locale === "en"
                ? t("calculationExplanation")
                : candidate.sourceMetricPoint!.tooltip;
            const href = isLever
              ? `/diagnostic-app?openLever=${watchItem!.leverKey}&openLeverLabel=${encodeURIComponent(displayLabel)}`
              : `/diagnostic-app?open=${candidate.key}`;

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
                        #{index + 1} · {displayCategory}
                      </p>
                      <p className="mt-0.5 font-bold">{displayLabel}</p>
                    </div>
                  </div>
                </div>

                {currentRate !== null && benchmarkRate !== null && (
                  <RateVsBenchmarkBar currentRate={currentRate} benchmarkRate={benchmarkRate} />
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  {candidate.extraClientsPerMonth !== null ? (
                    <div className="rounded-xl bg-muted p-3">
                      <p className="text-xs font-bold text-muted-foreground">{t("extraClientsLabel")}</p>
                      <p className="mt-1 font-display text-xl font-bold tabular-nums">+{candidate.extraClientsPerMonth}{t("perMonthSuffix")}</p>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-muted p-3">
                      <p className="text-xs font-bold text-muted-foreground">{t("status")}</p>
                      <p className="mt-1 text-sm font-bold">{candidate.isActive ? t("activeBelow") : "—"}</p>
                    </div>
                  )}
                  <div className="flex items-start justify-between rounded-xl bg-muted p-3">
                    <div>
                      <p className="text-xs font-bold text-muted-foreground">{t("gain")}</p>
                      <p className="mt-1 font-display text-xl font-bold tabular-nums">+{formatEur(candidate.monthlyGainEur, locale)}{t("perMonthSuffix")}</p>
                    </div>
                    <CalcPopover explanation={tooltip} />
                  </div>
                </div>

                <p className="text-sm text-muted-foreground">{advice}</p>

                {index === 0 && (
                  <div className="flex items-center gap-3 border-t border-accent/20 pt-4">
                    <Falco pose="alert" size="xs" animate="enter" />
                    <FalcoBubble arrow="left" className="max-w-none flex-1">
                      {t("adviceOne")}
                    </FalcoBubble>
                  </div>
                )}

                <Link href={href} prefetch={true} className="self-start text-sm font-bold text-muted-foreground hover:underline">
                  {t("viewDetail")}
                </Link>
                <QuickInsightLaunchButton
                  sourceType={isLever ? "diagnostic_lever" : "diagnostic_metric"}
                  sourceId={isLever ? `${watchItem!.leverKey}${watchItem!.statKey ? `:${watchItem!.statKey}` : ""}` : candidate.key}
                />
              </div>
            );
          })}

          {/* Contenu — chiffré comme le reste depuis que content_posts porte
              bookings/dealsClosed (lib/diagnostic/content-gain.ts). Toujours
              rendu après la liste scorée : le score priorité mêle un facteur
              faisabilité par métrique du funnel qui n'existe pas côté
              contenu, donc ces cartes gardent leur propre tri (par € décroissant,
              appliqué à la construction de contentPoints). */}
          {contentPoints.map(({ summary, gain }, contentIndex) => {
              const score = computeHealthScore(summary.currentRatePercent / 100, summary.benchmarkRatePercent / 100, summary.status);
              const tier = getHealthTier(score);
              const advice = adviceFor(summary.key, undefined, summary.currentRatePercent, summary.benchmarkRatePercent, "Falco", locale);
              const displayLabel = localizedContentMetricLabel(summary.key);

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
                        #{optimizeList.length + contentIndex + 1} · {localizedCategory("content")}
                      </p>
                      <p className="mt-0.5 font-bold">{displayLabel}</p>
                    </div>
                  </div>

                  <RateVsBenchmarkBar currentRate={summary.currentRatePercent / 100} benchmarkRate={summary.benchmarkRatePercent / 100} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-xl bg-muted p-3">
                      <p className="text-xs font-bold text-muted-foreground">{t("extraSalesLabel")}</p>
                      <p className="mt-1 font-display text-xl font-bold tabular-nums">+{gain.extraSales}{t("perMonthSuffix")}</p>
                    </div>
                    <div className="flex items-start justify-between rounded-xl bg-muted p-3">
                      <div>
                        <p className="text-xs font-bold text-muted-foreground">{t("gain")}</p>
                        <p className="mt-1 font-display text-xl font-bold tabular-nums">
                          {gain.monthlyGain === null ? "—" : `+${formatEur(gain.monthlyGain, locale)}${t("perMonthSuffix")}`}
                        </p>
                        {gain.usesBenchmark && (
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {t("benchmarkEstimate")}
                          </p>
                        )}
                      </div>
                      <CalcPopover explanation={gain.chain} />
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">{advice}</p>

                  <a
                    href={`/diagnostic-app?openLever=content&openLeverLabel=${encodeURIComponent(t("contentLabel"))}`}
                    className="self-start text-sm font-bold text-muted-foreground hover:underline"
                  >
                    {t("viewDetail")}
                  </a>
                  <QuickInsightLaunchButton sourceType="diagnostic_metric" sourceId={summary.key} />
                </div>
              );
            })}
        </div>

        {strongCount > 0 && (
          <Accordion type="single" collapsible>
            <AccordionItem value="points-forts" className="sticker-card-dashed rounded-xl border-0 px-5">
              <AccordionTrigger>
                <span className="rounded-full bg-state-healthy-bg px-2 py-0.5 text-xs font-bold text-state-healthy">
                  {t("strongPoints", { count: strongCount })} ▸
                </span>
              </AccordionTrigger>
              <AccordionContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {summaries
                  .filter((s) => s.status === "ok")
                  .map((summary) => (
                    <MetricSummaryCard
                      key={summary.key}
                      summary={{ ...summary, label: localizedMetricLabel(summary.key), category: localizedCategory(summary.category) }}
                      measureHint={measureHint(summary.key) ?? t("notMeasured")}
                      measureHintHref="/datas"
                      measureHintLabel={t("goToData")}
                    />
                  ))}
                {strong.map((item) => (
                  <OverviewActiveLeverCard
                    key={item.leverKey}
                    label={localizedLeverLabel(item.leverKey, item.label)}
                    category={localizedCategory(item.category)}
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
          <h2 className="text-lg font-bold">{t("addTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("addHelp")}</p>
        </div>

        {addList.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {addList.map(({ candidate }) => {
              const opportunity = addByKey.get(candidate.key)!;
              return (
                <DiscoveryOpportunityCard
                  key={opportunity.leverKey}
                  leverKey={opportunity.leverKey}
                  label={localizedLeverLabel(opportunity.leverKey, opportunity.label)}
                  category={localizedCategory(opportunity.category)}
                  effort={opportunity.effort}
                  impactAmountEur={opportunity.impactAmountEur}
                  impactRangeEur={opportunity.impactRangeEur}
                  impactExplanation={opportunity.impactExplanation}
                  contextSentence={opportunity.contextSentence}
                  warning={opportunity.warning}
                  ctaLabel={t("discover")}
                  sourcePage="diagnostic_overview"
                  insightSourceId={opportunity.leverKey}
                />
              );
            })}
          </div>
        ) : (
          <div className="sticker-card-dashed p-6 text-center text-sm text-muted-foreground">
            {t("noneAdditional")}
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
        <h2 className="text-base font-bold">{t("alreadyWorks")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <MetricSummaryCard
              key={summary.key}
              summary={{ ...summary, label: localizedMetricLabel(summary.key), category: localizedCategory(summary.category) }}
              measureHint={measureHint(summary.key) ?? t("notMeasured")}
              measureHintHref="/datas"
              measureHintLabel={t("goToData")}
            />
          ))}

          {contentSummaries.map((summary) => (
            <MetricSummaryCard
              key={summary.key}
              summary={{ ...summary, label: localizedContentMetricLabel(summary.key), category: localizedCategory(summary.category) }}
              measureHint={measureHint(summary.key) ?? t("notMeasured")}
              measureHintHref="/acquisition/contenu"
              measureHintLabel={t("goToContent")}
            />
          ))}

          <div className="sticker-card p-5">
            <p className="text-sm font-bold">{t("retention.title")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("retention.help")}</p>
            <p className="mt-3 font-display text-2xl font-bold tabular-nums">
              {contentRetention.currentRate === null ? "—" : `${Math.round(contentRetention.currentRate * 100)}%`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("retention.benchmark", { value: Math.round(contentRetention.benchmarkRate * 100) })}
            </p>
          </div>

          {followups.map((followup) => (
            <div key={followup.key} className="sticker-card p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">{localizedFollowupLabel(followup.key, followup.label)}</p>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", STATUS_BADGE[followup.status])}>
                  {followup.status === "ok" ? "✅" : followup.status === "critical" ? "❌" : "❓"}
                </span>
              </div>
              {followup.status === "unmeasured" && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" className="mt-2 text-left text-xs text-muted-foreground hover:underline">
                      {t("followupUnmeasured")}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent>
                    <p className="text-muted-foreground">
                      {t("followupHelp")}
                    </p>
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <Link href="/business" prefetch={true}>{t("goToBusiness")}</Link>
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
        <p className="text-sm font-bold">{t("simulateTitle")}</p>
        <p className="mt-2 text-lg">
          {t("simulationSummary", {
            real: projection.realSales === null ? "—" : `${Math.round(projection.realSales * 10) / 10} ${t("todaySales")}`,
            possible: projection.simulatedSales === null ? "—" : `${Math.round(projection.simulatedSales * 10) / 10} ${t("possibleSales")}`,
            gain: projection.monthlyGain !== null ? t("simulationGain", { amount: formatEur(projection.monthlyGain, locale) }) : "",
          })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("simulationHelp")}
        </p>
      </div>
    </div>
  );
}
