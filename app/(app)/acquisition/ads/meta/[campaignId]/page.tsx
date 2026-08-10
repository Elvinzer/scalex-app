import { ArrowLeft, CircleAlert, ExternalLink, Gauge, MousePointerClick, Play, UserPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { z } from "zod";

import { MetaCampaignActions } from "@/components/meta-ads/meta-campaign-actions";
import { MetaEntityAction } from "@/components/meta-ads/meta-entity-action";
import { MetaCampaignProfileSelector } from "@/components/meta-ads/meta-campaign-profile-selector";
import { MetaCampaignTargets } from "@/components/meta-ads/meta-campaign-targets";
import { MetaInsightCard } from "@/components/meta-ads/meta-insight-card";
import { MetaDataQuality } from "@/components/meta-ads/meta-data-quality";
import { MetaPeriodFilter } from "@/components/meta-ads/meta-period-filter";
import { MetaTouchpointGenerator } from "@/components/meta-ads/meta-touchpoint-generator";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { getBusinessProfile } from "@/lib/business/queries";
import { META_INSIGHT_THRESHOLDS } from "@/lib/meta-ads/thresholds";
import { buildMetaAudienceWarnings } from "@/lib/meta-ads/audience-warnings";
import { buildMetaAdsInsights, materializeMetaAdsInsights } from "@/lib/meta-ads/insights";
import { metaAdsErrorMessage } from "@/lib/meta-ads/messages";
import { safeRatio as ratio } from "@/lib/meta-ads/derived-metrics";
import { getMetaAdsDashboard, getMetaCampaignDetail, metricValue, rawMetaMetricValue } from "@/lib/meta-ads/queries";
import { trendLabel } from "@/lib/meta-ads/metric-comparison";
import { META_PERIOD_RANGE_OPTIONS, formatMetaPeriodRange, metaAdsManagerUrl, metaPeriodSelectionLabel, normalizeMetaPeriodSelection, serializeMetaPeriodSelection } from "@/lib/meta-ads/protocol";
import { targetVarianceLabel } from "@/lib/meta-ads/targets";
import { campaignTypeNeedsConversionGoal } from "@/lib/meta-ads/types";
import { formatPercent } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";

function typeLabel(value: string | null, locale: string): string {
  if (value === "vsl") return "VSL";
  if (value === "webinar") return locale === "en" ? "Webinar" : "Webinaire";
  if (value === "instagram_profile_growth") return locale === "en" ? "Instagram traffic" : "Trafic Instagram";
  if (value === "retargeting") return "Retargeting";
  return locale === "en" ? "Type to define" : "Type à définir";
}

const campaignSearchParamsSchema = z.object({
  meta_days: z.string().optional(),
  meta_range: z.enum(META_PERIOD_RANGE_OPTIONS).optional(),
  meta_from: z.string().optional(),
  meta_to: z.string().optional(),
  meta_ads: z.enum(["write_declined", "write_ready"]).optional(),
  meta_ads_error: z.string().optional(),
});

function webinarSourceLabel(value: string): string {
  if (value === "calendly") return "Calendly";
  if (value === "iclosed") return "iClosed";
  return "Scale X";
}

function actionLabel(value: string, locale: string): string {
  if (value === "pause") return "Pause";
  if (value === "resume") return locale === "en" ? "Resume" : "Reprise";
  if (value === "set_daily_budget") return locale === "en" ? "Daily budget" : "Budget quotidien";
  return value;
}

function actionStatusLabel(value: string, locale: string): string {
  if (value === "succeeded") return locale === "en" ? "Succeeded" : "Réussie";
  if (value === "failed") return locale === "en" ? "Failed" : "Échouée";
  if (value === "permission_insufficient") return locale === "en" ? "Insufficient permission" : "Permission insuffisante";
  if (value === "changed_between_proposal") return locale === "en" ? "Changed in the meantime" : "Modifiée entre-temps";
  if (value === "unknown") return locale === "en" ? "Unknown state" : "État inconnu";
  if (value === "blocked") return locale === "en" ? "Blocked" : "Bloquée";
  if (value === "in_progress") return locale === "en" ? "In progress" : "En cours";
  return value;
}

function actionStateLabel(state: Record<string, unknown>, locale: string): string {
  const status = typeof state.status === "string" ? state.status : null;
  const budget = typeof state.daily_budget === "number" || typeof state.daily_budget === "string" ? String(state.daily_budget) : null;
  const perDay = locale === "en" ? "cents/day" : "cents/jour";
  if (status && budget) return `${status} · ${budget} ${perDay}`;
  return status ?? (budget ? `${budget} ${perDay}` : "—");
}

function creativeCpaCents(row: { metrics: Parameters<typeof metricValue>[0] }): number | null {
  const spend = metricValue(row.metrics, "spendCents");
  const leads = metricValue(row.metrics, "leads");
  return spend !== null && leads !== null && leads > 0 ? spend / leads : null;
}

function Metric({ label, value, detail, comparison, provenance }: { label: string; value: string; detail: string; comparison?: string; provenance?: string }) {
  return (
    <div className="sticker-card p-5">
      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      {comparison && <p className="mt-2 text-xs font-bold text-muted-foreground">{comparison}</p>}
      {provenance && <p className="mt-2 text-[11px] font-bold text-muted-foreground">{provenance}</p>}
    </div>
  );
}

function TableMetric({ value, provenance, detail }: { value: string; provenance: string; detail?: string }) {
  return (
    <div>
      <span>{value}</span>
      <span className="mt-1 block text-[10px] font-normal leading-4 text-muted-foreground">{provenance}</span>
      {detail && <span className="block text-[10px] font-normal leading-4 text-muted-foreground">{detail}</span>}
    </div>
  );
}

function metricProvenance(
  source: string,
  calculation: "brute" | "dérivée",
  available: boolean,
  attribution: "directe" | "jointe" = "directe",
  locale = "fr",
): string {
  const calculationLabel = locale === "en" ? (calculation === "brute" ? "raw" : "derived") : calculation;
  const attributionLabel = locale === "en" ? (attribution === "directe" ? "direct" : "joined") : attribution;
  return `${source} · ${calculationLabel} · ${available ? attributionLabel : locale === "en" ? "unavailable" : "indisponible"}`;
}

function ProgressRow({ label, numerator, denominator, unavailableReason, locale }: { label: string; numerator: number | null; denominator: number | null; unavailableReason?: string; locale: string }) {
  const rate = ratio(numerator, denominator);
  const width = rate === null ? 0 : Math.min(100, Math.max(3, rate * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs font-bold text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-muted">
        {rate !== null && <div className="h-2 rounded-full bg-accent-2" style={{ width: `${width}%` }} />}
      </div>
      <span className="w-40 shrink-0 text-right text-xs font-bold tabular-nums">
        <span>{rate === null ? "—" : formatPercent(rate, locale)}</span>
        {rate === null && <span className="mt-1 block text-[10px] font-normal leading-4 text-muted-foreground">{unavailableReason ?? (locale === "en" ? "Unavailable for this period" : "Indisponible sur la période")}</span>}
      </span>
    </div>
  );
}

type FunnelTableRow = {
  label: string;
  numerator: number | null;
  denominator: number | null;
  unavailableReason?: string;
  availability?: string;
};

function FunnelTable({ rows, locale, labels }: { rows: FunnelTableRow[]; locale: string; labels: { aria: string; caption: string; step: string; value: string; rate: string; availability: string; unavailable: string; measured: string } }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-[var(--radius-control)] border border-border" tabIndex={0} role="region" aria-label={labels.aria}>
      <table className="w-full min-w-[32rem] text-xs">
        <caption className="sr-only">{labels.caption}</caption>
        <thead>
          <tr className="border-b border-border text-left font-bold text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card px-3 py-2">{labels.step}</th>
            <th className="px-3 py-2 text-right">{labels.value}</th>
            <th className="px-3 py-2 text-right">{labels.rate}</th>
            <th className="px-3 py-2">{labels.availability}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rate = ratio(row.numerator, row.denominator);
            return (
              <tr key={row.label} className="border-b border-border last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-bold">{row.label}</th>
                <td className="px-3 py-2 text-right tabular-nums">{row.numerator === null ? "—" : row.numerator.toLocaleString(locale)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{rate === null ? "—" : formatPercent(rate, locale)}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.unavailableReason ?? (row.numerator === null ? labels.unavailable : row.availability ?? labels.measured)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function MetaCampaignDetailPage({ params, searchParams }: { params: Promise<{ campaignId: string }>; searchParams: Promise<{ meta_days?: string; meta_range?: string; meta_from?: string; meta_to?: string; meta_ads?: string; meta_ads_error?: string }> }) {
  const locale = await getLocale();
  const t = await getTranslations("app.ads.detail");
  const profileT = await getTranslations("app.ads.profile");
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:ads");
  const { campaignId } = await params;
  const parsedSearchParams = campaignSearchParamsSchema.safeParse(await searchParams);
  const search = parsedSearchParams.success ? parsedSearchParams.data : {};
  const periodSelection = normalizeMetaPeriodSelection(search);
  const periodQuery = serializeMetaPeriodSelection(periodSelection);
  const metaAdsErrorMessageText = metaAdsErrorMessage(search.meta_ads_error);
  const [dashboard, businessProfile] = await Promise.all([
    getMetaAdsDashboard(accountId, periodSelection),
    getBusinessProfile(accountId),
  ]);
  if (!dashboard) notFound();
  if (periodSelection.kind !== "days" || periodSelection.days !== 30) {
    try {
      await materializeMetaAdsInsights(accountId, dashboard, campaignId);
    } catch (error) {
      console.error("Meta Ads insight refresh for selected period failed", error instanceof Error ? error.message : "unknown");
    }
  }
  const detail = await getMetaCampaignDetail(accountId, campaignId, periodSelection, dashboard);
  if (!detail) notFound();

  const activeInsightRuleKeys: Set<string> = new Set(
    buildMetaAdsInsights(dashboard)
      .filter((proposal) => proposal.campaignId === campaignId)
      .map((proposal) => proposal.ruleKey),
  );
  const currentInsights = detail.insights.filter((insight) => {
    const ruleKey = insight.snapshot.ruleKey;
    return typeof ruleKey === "string" && activeInsightRuleKeys.has(ruleKey);
  });

  const metrics = detail.campaign.metrics;
  const comparisonMetrics = detail.campaign.comparisonMetrics;
  const spendCents = metricValue(metrics, "spendCents");
  const comparisonSpendCents = metricValue(comparisonMetrics, "spendCents");
  const impressions = metricValue(metrics, "impressions");
  const comparisonImpressions = metricValue(comparisonMetrics, "impressions");
  const linkClicks = metricValue(metrics, "linkClicks");
  const comparisonLinkClicks = metricValue(comparisonMetrics, "linkClicks");
  const leads = metricValue(metrics, "leads");
  const comparisonLeads = metricValue(comparisonMetrics, "leads");
  const video3sViews = metricValue(metrics, "video3sViews");
  const videoThruplay = metricValue(metrics, "videoThruplay");
  const profileVisits = metricValue(metrics, "profileVisits");
  const observedFollows = detail.dashboard.instagramObservation.current.follows;
  const registrations = metricValue(metrics, "registrations");
  const webinarObservation = detail.campaign.webinarObservation;
  const webinarParticipants = webinarObservation?.current.participants ?? null;
  const purchaseValueCents = metricValue(metrics, "purchaseValueCents");
  const rawCtr = rawMetaMetricValue(metrics, "ctr");
  const rawComparisonCtr = rawMetaMetricValue(comparisonMetrics, "ctr");
  const ctr = rawCtr ?? ratio(linkClicks, impressions);
  const comparisonCtr = rawComparisonCtr ?? ratio(comparisonLinkClicks, comparisonImpressions);
  const rawCpcCents = rawMetaMetricValue(metrics, "cpcCents");
  const rawComparisonCpcCents = rawMetaMetricValue(comparisonMetrics, "cpcCents");
  const cpc = rawCpcCents !== null
    ? rawCpcCents / 100
    : linkClicks !== null && linkClicks > 0 && spendCents !== null
      ? spendCents / linkClicks / 100
      : null;
  const comparisonCpc = rawComparisonCpcCents !== null
    ? rawComparisonCpcCents / 100
    : comparisonLinkClicks !== null && comparisonLinkClicks > 0 && comparisonSpendCents !== null
      ? comparisonSpendCents / comparisonLinkClicks / 100
      : null;
  const cpl = leads !== null && leads > 0 && spendCents !== null ? spendCents / leads / 100 : null;
  const comparisonCpl = comparisonLeads !== null && comparisonLeads > 0 && comparisonSpendCents !== null ? comparisonSpendCents / comparisonLeads / 100 : null;
  const cplDetail = detail.campaign.campaignType === "instagram_profile_growth"
    ? t("notApplicableType")
    : leads === null
      ? t("leadsUnavailable")
      : leads === 0
        ? t("noLeads")
        : spendCents === null
          ? `${leads.toLocaleString(locale)} lead(s) · ${t("spendUnavailable")}`
          : `${leads.toLocaleString(locale)} lead(s)`;
  const instagramGrowth = detail.campaign.campaignType === "instagram_profile_growth";
  const metaRoas = !instagramGrowth && purchaseValueCents !== null && spendCents !== null && spendCents > 0 ? purchaseValueCents / spendCents : null;
  const comparisonPurchaseValueCents = metricValue(comparisonMetrics, "purchaseValueCents");
  const comparisonRoas = comparisonPurchaseValueCents !== null && comparisonSpendCents !== null && comparisonSpendCents > 0 ? comparisonPurchaseValueCents / comparisonSpendCents : null;
  const rawCpmCents = rawMetaMetricValue(metrics, "cpmCents");
  const rawComparisonCpmCents = rawMetaMetricValue(comparisonMetrics, "cpmCents");
  const cpm = rawCpmCents !== null
    ? rawCpmCents / 100
    : impressions !== null && impressions > 0 && spendCents !== null
      ? (spendCents / impressions) * 1000 / 100
      : null;
  const comparisonCpm = rawComparisonCpmCents !== null
    ? rawComparisonCpmCents / 100
    : comparisonImpressions !== null && comparisonImpressions > 0 && comparisonSpendCents !== null
      ? (comparisonSpendCents / comparisonImpressions) * 1000 / 100
      : null;
  const maxSpend = Math.max(1, ...detail.daily.map((point) => point.spendCents ?? 0));
  const targets = detail.campaign.targets ?? { targetCpaCents: null, targetRoas: null, leadValueCents: null };
  const targetCpaEuros = targets.targetCpaCents === null ? null : targets.targetCpaCents / 100;
  const cplApplicable = !instagramGrowth;
  const cplTargetLabel = cplApplicable ? targetVarianceLabel(cpl, targetCpaEuros, locale) : null;
  const roasTargetLabel = targetVarianceLabel(metaRoas, targets.targetRoas, locale);
  const leadValueLabel = targets.leadValueCents === null ? null : t("leadValue", { value: formatEur(targets.leadValueCents / 100, locale) });
  const mainOffer = businessProfile.sales.offers.find((offer) => offer.isMain && offer.price !== null);
  const managerUrl = metaAdsManagerUrl(detail.dashboard.account.externalId, detail.campaign.externalId);
  const attribution = detail.attributionQuality;
  const attributionLabel = attribution.status === "verified" ? (locale === "en" ? "Verified" : "Vérifiée") : attribution.status === "partial" ? (locale === "en" ? "Partial" : "Partielle") : (locale === "en" ? "Not calculable" : "Non calculable");
  const conversionGoalRequired = campaignTypeNeedsConversionGoal(detail.campaign.campaignType);
  const campaignConfigured = detail.campaign.campaignType !== null
    && (!conversionGoalRequired || detail.campaign.conversionGoal !== null);
  const conversionGoal = detail.campaign.conversionGoal === "call"
    ? profileT("call")
    : detail.campaign.conversionGoal === "sale"
      ? profileT("sale")
      : null;
  const conversionMetricLabel = detail.campaign.conversionGoal === "call" ? (locale === "en" ? "Booked calls" : "Appels réservés") : detail.campaign.conversionGoal === "sale" ? (locale === "en" ? "Linked sales" : "Ventes reliées") : (locale === "en" ? "Business conversion" : "Conversion business");
  const conversionMetricValue = attribution.status === "unavailable"
    ? null
    : detail.campaign.conversionGoal === "call"
      ? attribution.bookedCalls
      : detail.campaign.conversionGoal === "sale"
        ? attribution.sales
        : null;
  const conversionMetricBase = detail.campaign.campaignType === "webinar" ? registrations : leads;
  const conversionUnavailableReason = !campaignConfigured
    ? (locale === "en" ? "Choose the campaign type and conversion goal to display this step" : "Choisis le type et l’objectif de conversion pour afficher cette étape")
    : attribution.status === "unavailable"
      ? (locale === "en" ? "No Scale X attribution is available for this campaign for this period" : "Aucune attribution Scale X disponible pour cette campagne sur la période")
      : undefined;
  const hasWriteAccess = detail.dashboard.connection.grantedScopes.includes("ads_management");
  const rankedAds = [...detail.ads].sort((left, right) => {
    const leftCpa = creativeCpaCents(left);
    const rightCpa = creativeCpaCents(right);
    if (leftCpa !== null && rightCpa !== null && leftCpa !== rightCpa) return leftCpa - rightCpa;
    if (leftCpa !== null) return -1;
    if (rightCpa !== null) return 1;
    return (metricValue(right.metrics, "spendCents") ?? 0) - (metricValue(left.metrics, "spendCents") ?? 0);
  });
  const audienceLadder = [...detail.audiences]
    .filter((audience) => audience.windowDays !== null)
    .sort((left, right) => (left.windowDays ?? Number.POSITIVE_INFINITY) - (right.windowDays ?? Number.POSITIVE_INFINITY));
  const adSetsById = new Map(detail.adSets.map((adSet) => [adSet.id, adSet]));
  const audienceWarnings = buildMetaAudienceWarnings(
    detail.audiences.map((audience) => {
      const adSetMetrics = adSetsById.get(audience.adSetId)?.metrics;
      const impressions = adSetMetrics ? metricValue(adSetMetrics, "impressions") : null;
      const linkClicks = adSetMetrics ? metricValue(adSetMetrics, "linkClicks") : null;
      const reach = adSetMetrics ? metricValue(adSetMetrics, "reach") : null;
      return {
        id: audience.adSetId,
        name: audience.adSetName,
        active: audience.active,
        included: audience.included,
        excluded: audience.excluded,
        targetingAvailable: audience.targetingAvailable,
        impressions,
        linkClicks,
        frequency: ratio(impressions, reach),
      };
    }),
    {
      minImpressions: META_INSIGHT_THRESHOLDS.minImpressions,
      minClicks: META_INSIGHT_THRESHOLDS.minClicks,
      frequencySaturation: detail.dashboard.frequencySaturationThreshold,
    },
  );
  const funnelRows: FunnelTableRow[] = [
    { label: locale === "en" ? "Click / impression" : "Clic / impression", numerator: linkClicks, denominator: impressions },
  ];
  if (campaignConfigured && detail.campaign.campaignType === "vsl") {
    funnelRows.push(
      { label: locale === "en" ? "3-sec view" : "Vue 3 sec.", numerator: video3sViews, denominator: impressions },
      { label: "ThruPlay / vue", numerator: videoThruplay, denominator: video3sViews },
      { label: locale === "en" ? "VSL playback" : "Lecture VSL", numerator: null, denominator: null, unavailableReason: locale === "en" ? "Missing source: VSL page playback events" : "Source manquante : événements de lecture de la page VSL" },
      { label: "Watch depth", numerator: null, denominator: null, unavailableReason: locale === "en" ? "Missing source: VSL page progression events" : "Source manquante : événements de progression de la page VSL" },
      { label: conversionMetricLabel, numerator: conversionMetricValue, denominator: conversionMetricBase, unavailableReason: conversionUnavailableReason, availability: locale === "en" ? "Scale X · joined attribution" : "Scale X · attribution jointe" },
    );
  }
  if (campaignConfigured && detail.campaign.campaignType === "webinar") {
    funnelRows.push(
      { label: locale === "en" ? "Registrations" : "Inscriptions", numerator: registrations, denominator: linkClicks },
      { label: locale === "en" ? "Live attendance" : "Présence live", numerator: webinarParticipants, denominator: registrations, unavailableReason: webinarParticipants === null ? (locale === "en" ? "Missing source: webinar attendance event" : "Source manquante : événement de présence du webinar") : undefined },
      { label: locale === "en" ? "Attendance through pitch" : "Présence jusqu'au pitch", numerator: null, denominator: registrations, unavailableReason: locale === "en" ? "Missing source: webinar progression event" : "Source manquante : événement de progression du webinar" },
      { label: conversionMetricLabel, numerator: conversionMetricValue, denominator: conversionMetricBase, unavailableReason: conversionUnavailableReason, availability: locale === "en" ? "Scale X · joined attribution" : "Scale X · attribution jointe" },
    );
  }
  if (campaignConfigured && detail.campaign.campaignType === "instagram_profile_growth") {
    funnelRows.push({ label: locale === "en" ? "Follow / visit" : "Follow / visite", numerator: observedFollows, denominator: profileVisits, unavailableReason: detail.dashboard.instagramObservation.connected ? undefined : (locale === "en" ? "Missing source: Instagram connection" : "Source manquante : connexion Instagram") });
  }
  if (campaignConfigured && detail.campaign.campaignType === "retargeting") {
    funnelRows.push({ label: t("frequency"), numerator: impressions, denominator: metricValue(metrics, "reach") });
  }
  const funnelTableLabels = {
    aria: t("funnelTableAria"),
    caption: t("tableCaption"),
    step: t("step"),
    value: t("value"),
    rate: t("rate"),
    availability: t("availability"),
    unavailable: t("unavailablePeriod"),
    measured: t("measured"),
  };

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" asChild className="mb-3 -ml-2">
            <Link href={`/acquisition/ads?${periodQuery}`}><ArrowLeft className="size-4" />{t("backToAds")}</Link>
          </Button>
          <p className="text-xs font-bold tracking-wide text-accent-2 uppercase">Meta Ads · {typeLabel(detail.campaign.campaignType, locale)}</p>
          <h1 className="mt-1 text-3xl font-bold">{detail.campaign.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{metaPeriodSelectionLabel(periodSelection)} · {formatMetaPeriodRange(detail.dashboard.period)} · {detail.campaign.objective ?? t("objectiveMissing")}</p>
          {conversionGoalRequired && (
            <p className="mt-1 text-xs text-muted-foreground">
              {campaignConfigured && conversionGoal
                ? t("conversionGoal", { value: conversionGoal })
                : t("conversionToDefine")}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{t("comparison", { start: detail.dashboard.comparisonPeriod.start, end: detail.dashboard.comparisonPeriod.end })}</p>
          <p className="mt-2 text-xs font-bold text-muted-foreground">
            {detail.dashboard.period.consolidatedThrough
              ? t("consolidated", { date: new Intl.DateTimeFormat(locale).format(new Date(`${detail.dashboard.period.consolidatedThrough}T12:00:00Z`)) })
              : t("consolidating")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("coverage", { value: detail.campaign.metricCoverageRate === null || detail.campaign.metricCoverageRate === undefined ? "—" : formatPercent(detail.campaign.metricCoverageRate, locale) })}
          </p>
          {detail.dashboard.missingMetricDates.length > 0 && (
            <p className="mt-1 text-xs font-bold text-state-caution" role="status">
              {t("missingDates", { dates: detail.dashboard.missingMetricDates.slice(0, 8).join(", "), count: Math.max(0, detail.dashboard.missingMetricDates.length - 8) })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MetaPeriodFilter selection={periodSelection} period={detail.dashboard.period} />
          <Button asChild variant="outline">
            <a href={managerUrl} target="_blank" rel="noopener noreferrer">
              {t("openMetaAds")} <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>
      </div>

      <MetaDataQuality
        coverageRate={detail.campaign.metricCoverageRate ?? null}
        missingDates={detail.dashboard.missingMetricDates}
        consolidatedThrough={detail.dashboard.period.consolidatedThrough}
        initialSyncStatus={detail.dashboard.connection.initialSyncStatus}
      />

      <MetaCampaignProfileSelector
        campaignId={detail.campaign.id}
        campaignType={detail.campaign.campaignType}
        conversionGoal={detail.campaign.conversionGoal}
        metaObjective={detail.campaign.objective}
        typeSource={detail.campaign.typeSource}
      />

      {metaAdsErrorMessageText && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-4 py-3 text-sm font-bold text-state-critical" role="alert">
          {metaAdsErrorMessageText}
        </div>
      )}
      {search.meta_ads === "write_declined" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-4 py-3 text-sm text-state-caution" role="status">
          <span>{t("permissionDeclined")}</span>
          <a href={managerUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline-offset-4 hover:underline">
            {t("openMetaAds")}
          </a>
        </div>
      )}
      {search.meta_ads === "write_ready" && (
        <p className="rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-4 py-3 text-sm font-bold text-state-healthy" role="status">
          {t("permissionGranted")}
        </p>
      )}

      <MetaCampaignTargets
        campaignId={detail.campaign.id}
        targetCpaCents={targets.targetCpaCents}
        targetRoas={targets.targetRoas}
        leadValueCents={targets.leadValueCents}
        suggestedLeadValueCents={mainOffer?.price === null || mainOffer?.price === undefined ? null : Math.round(mainOffer.price * 100)}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-8">
        <Metric label={t("spend")} value={spendCents === null ? "—" : formatEur(spendCents / 100, locale)} detail={`${impressions === null ? "—" : impressions.toLocaleString(locale)} ${t("impressions")}`} comparison={trendLabel(spendCents, comparisonSpendCents, locale)} provenance={metricProvenance("Meta", "brute", spendCents !== null, "directe", locale)} />
        <Metric label={t("linkCtr")} value={ctr === null ? "—" : formatPercent(ctr, locale)} detail={`${linkClicks === null ? "—" : linkClicks.toLocaleString(locale)} ${t("linkClicks")} `} comparison={trendLabel(ctr, comparisonCtr, locale)} provenance={metricProvenance("Meta", rawCtr !== null ? "brute" : "dérivée", ctr !== null, "directe", locale)} />
        <Metric label={t("linkCpc")} value={cpc === null ? "—" : formatEur(cpc, locale)} detail={t("outboundCost")} comparison={trendLabel(cpc, comparisonCpc, locale)} provenance={metricProvenance("Meta", rawCpcCents !== null ? "brute" : "dérivée", cpc !== null, "directe", locale)} />
        <Metric label={t("cpm")} value={cpm === null ? "—" : formatEur(cpm, locale)} detail={t("cpmDetail")} comparison={trendLabel(cpm, comparisonCpm, locale)} provenance={metricProvenance("Meta", rawCpmCents !== null ? "brute" : "dérivée", cpm !== null, "directe", locale)} />
        <Metric label={t("costPerLead")} value={!cplApplicable || cpl === null ? "—" : formatEur(cpl, locale)} detail={[cplDetail, cplApplicable ? leadValueLabel : null, cplApplicable && targetCpaEuros !== null ? t("target", { value: formatEur(targetCpaEuros, locale), gap: cplTargetLabel ?? t("gapUnavailable") }) : null].filter(Boolean).join(" · ")} comparison={cplApplicable ? trendLabel(cpl, comparisonCpl, locale) : t("notApplicable")} provenance={metricProvenance("Meta", "dérivée", cplApplicable && cpl !== null, "directe", locale)} />
        <Metric label={t("roas")} value={instagramGrowth ? "—" : metaRoas === null ? "—" : `${metaRoas.toFixed(2)}×`} detail={instagramGrowth ? t("notApplicableProfile") : [purchaseValueCents === null ? t("purchaseValueUnavailable") : t("purchaseValue", { value: formatEur(purchaseValueCents / 100, locale) }), targets.targetRoas === null ? null : t("target", { value: `${targets.targetRoas.toFixed(2)}×`, gap: roasTargetLabel ?? t("gapUnavailable") })].filter(Boolean).join(" · ")} comparison={instagramGrowth ? t("notApplicable") : trendLabel(metaRoas, comparisonRoas, locale)} provenance={metricProvenance("Meta", "dérivée", !instagramGrowth && metaRoas !== null, "directe", locale)} />
        <Metric label={t("cashRevenue")} value={attribution.revenueCents === null ? "—" : formatEur(attribution.revenueCents / 100, locale)} detail={attribution.revenueCents === null ? t("coverageInsufficient") : t("salesCount", { count: attribution.sales.toLocaleString(locale) })} provenance={metricProvenance("Stripe + Meta", "dérivée", attribution.revenueCents !== null, "jointe", locale)} />
        <Metric label={t("status")} value={detail.campaign.effectiveStatus ?? "—"} detail={detail.campaign.dailyBudgetCents === null ? t("metaBudgetMissing") : `${formatEur(detail.campaign.dailyBudgetCents / 100, locale)} ${t("perDay")}`} provenance={metricProvenance("Meta", "brute", detail.campaign.effectiveStatus !== null, "directe", locale)} />
      </div>

      <section className="sticker-card p-6" aria-labelledby="attribution-quality-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="attribution-quality-title" className="font-bold">{t("attributionQuality")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {attribution.status === "verified"
                ? t("verifiedAttribution")
                : attribution.status === "partial"
                  ? t("partialAttribution")
                  : t("noAttribution")}
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{attributionLabel}</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label={t("touchpoints")} value={attribution.touchpoints.toLocaleString(locale)} detail={t("usedLinks")} provenance={metricProvenance("Scale X", "brute", true, "directe", locale)} />
          <Metric label={t("attributedLeads")} value={attribution.leads.toLocaleString(locale)} detail={t("attributedForms")} provenance={metricProvenance("Scale X", "brute", true, "jointe", locale)} />
          <Metric label={t("attributedCalls")} value={attribution.bookedCalls.toLocaleString(locale)} detail={t("closedCalls", { count: attribution.closedCalls.toLocaleString(locale) })} provenance={metricProvenance("Scale X", "brute", true, "jointe", locale)} />
          <Metric label={t("attributedSales")} value={attribution.sales.toLocaleString(locale)} detail={t("salesWithTouchpoint")} provenance={metricProvenance("Scale X", "brute", true, "jointe", locale)} />
          <Metric label={t("attributedRevenue")} value={attribution.revenueCents === null ? "—" : formatEur(attribution.revenueCents / 100, locale)} detail={attribution.revenueCents === null ? t("coverageInsufficient") : t("linkedSalesOnly")} provenance={metricProvenance("Meta + Stripe", "dérivée", attribution.revenueCents !== null, "jointe", locale)} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t("touchpointLevel")} {attribution.levels.ad} ad ({attribution.levelCoverage.ad === null ? "—" : formatPercent(attribution.levelCoverage.ad, locale)}) · {attribution.levels.adset} ad set ({attribution.levelCoverage.adset === null ? "—" : formatPercent(attribution.levelCoverage.adset, locale)}) · {attribution.levels.campaign} campaign ({attribution.levelCoverage.campaign === null ? "—" : formatPercent(attribution.levelCoverage.campaign, locale)}) · {attribution.levels.utm_seul} UTM only ({attribution.levelCoverage.utm_seul === null ? "—" : formatPercent(attribution.levelCoverage.utm_seul, locale)}).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("accountSalesCoverage", { coverage: attribution.coverageRate === null ? "—" : formatPercent(attribution.coverageRate, locale), unattributed: attribution.unattributedSalesInPeriod.toLocaleString(locale), total: attribution.salesInPeriod.toLocaleString(locale) })}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("stripeReadOnly")}
        </p>
      </section>

      <MetaCampaignActions
        campaignId={detail.campaign.id}
        status={detail.campaign.effectiveStatus}
        dailyBudgetCents={detail.campaign.dailyBudgetCents}
        hasWriteAccess={hasWriteAccess}
        accountLabel={detail.dashboard.account.name}
        deepLink={managerUrl}
        returnTo={`/acquisition/ads/meta/${detail.campaign.id}?${periodQuery}`}
      />

      <section className="sticker-card overflow-x-auto" aria-labelledby="meta-action-history-title" tabIndex={0} role="region">
        <div className="border-b border-border px-5 py-4">
          <h2 id="meta-action-history-title" className="font-bold">{t("actionHistory")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("actionHistoryHelp")}</p>
        </div>
        {detail.actionLogs.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">{t("noActions")}</p>
        ) : (
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card px-5 py-3">{t("date")}</th>
                <th className="px-5 py-3">{t("level")}</th>
                <th className="px-5 py-3">{t("action")}</th>
                <th className="px-5 py-3">{t("beforeRequested")}</th>
                <th className="px-5 py-3">{t("result")}</th>
              </tr>
            </thead>
            <tbody>
              {detail.actionLogs.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-5 py-3 text-xs text-muted-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(new Date(log.createdAt))}</td>
                  <td className="px-5 py-3 text-xs font-bold uppercase text-muted-foreground">{log.entityType}</td>
                  <td className="px-5 py-3 font-bold">{actionLabel(log.actionType, locale)}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{actionStateLabel(log.requestedState, locale)}</td>
                  <td className="px-5 py-3">
                    <p className="text-xs font-bold">{actionStatusLabel(log.status, locale)}</p>
                    <p className="text-xs text-muted-foreground">{log.resultState ? actionStateLabel(log.resultState, locale) : log.errorMessage ?? "—"}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <MetaTouchpointGenerator
        campaignId={detail.campaign.id}
        landingPageUrl={detail.campaign.landingPageUrl}
        adSetOptions={detail.adSets.map((adSet) => ({ id: adSet.id, name: adSet.name }))}
        adOptions={detail.ads.map((ad) => ({ id: ad.id, name: ad.name }))}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="sticker-card overflow-x-auto" aria-labelledby="placements-title" tabIndex={0} role="region">
          <div className="border-b border-border px-5 py-4">
            <h2 id="placements-title" className="font-bold">{t("placements")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("placementsHelp")}</p>
          </div>
          {detail.placements.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t("placementsUnavailable")}</p>
          ) : (
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr className="border-b border-border text-left font-bold text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-4 py-3">{t("platform")}</th>
                  <th className="px-4 py-3">{t("position")}</th>
                  <th className="px-4 py-3 text-right">{t("spend")}</th>
                  <th className="px-4 py-3 text-right">{t("linkCtr")}</th>
                  <th className="px-4 py-3 text-right">{t("frequency")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.placements.map((placement) => {
                  const placementSpend = metricValue(placement.metrics, "spendCents");
                  const placementImpressions = metricValue(placement.metrics, "impressions");
                  const placementClicks = metricValue(placement.metrics, "linkClicks");
                  const placementReach = metricValue(placement.metrics, "reach");
                  const placementCtr = ratio(placementClicks, placementImpressions);
                  const placementFrequency = ratio(placementImpressions, placementReach);
                  return (
                    <tr key={`${placement.publisherPlatform}:${placement.platformPosition}`} className="border-b border-border last:border-0">
                      <td className="sticky left-0 z-10 bg-card px-4 py-3 font-bold">{placement.publisherPlatform}</td>
                      <td className="px-4 py-3">{placement.platformPosition}</td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <TableMetric value={placementSpend === null ? "—" : formatEur(placementSpend / 100, locale)} provenance={metricProvenance("Meta", "brute", placementSpend !== null, "directe", locale)} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <TableMetric value={placementCtr === null ? "—" : formatPercent(placementCtr, locale)} provenance={metricProvenance("Meta", "dérivée", placementCtr !== null, "directe", locale)} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        <TableMetric value={placementFrequency === null ? "—" : placementFrequency.toFixed(1)} provenance={metricProvenance("Meta", "dérivée", placementFrequency !== null, "directe", locale)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">{t("frequencyFootnote", { threshold: detail.dashboard.frequencySaturationThreshold })}</p>
        </section>

        <section className="sticker-card overflow-x-auto" aria-labelledby="audiences-title" tabIndex={0} role="region">
          <div className="border-b border-border px-5 py-4">
            <h2 id="audiences-title" className="font-bold">{t("audiencesTitle")}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("audienceSummary")}</p>
          </div>
          {audienceWarnings.length > 0 && (
            <div role="status" aria-live="polite" className="border-b border-state-caution/40 bg-state-caution/10 px-5 py-4 text-sm">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-state-caution" aria-hidden="true" />
                <div>
                  <p className="font-bold text-state-caution">{t("warningTitle")}</p>
                  <ul className="mt-2 space-y-2 text-muted-foreground">
                    {audienceWarnings.map((warning) => {
                      const names = warning.audienceNames.join(" · ");
                      if (warning.kind === "insufficient_volume") {
                        const lowSignals = [
                          warning.impressions !== null && warning.impressions < META_INSIGHT_THRESHOLDS.minImpressions
                            ? `${warning.impressions.toLocaleString(locale)} impressions (< ${META_INSIGHT_THRESHOLDS.minImpressions.toLocaleString(locale)})`
                            : null,
                          warning.linkClicks !== null && warning.linkClicks < META_INSIGHT_THRESHOLDS.minClicks
                            ? `${warning.linkClicks.toLocaleString(locale)} ${t("linkClicks")} (< ${META_INSIGHT_THRESHOLDS.minClicks.toLocaleString(locale)})`
                            : null,
                        ].filter((signal): signal is string => signal !== null);
                        return <li key={`audience-warning-${warning.kind}-${warning.audienceIds.join("-")}`}>{t("insufficientVolume", { names, signals: lowSignals.join(locale === "en" ? " and " : " et ") })}</li>;
                      }
                      if (warning.kind === "frequency_saturation") {
                        return <li key={`audience-warning-${warning.kind}-${warning.audienceIds.join("-")}`}>{t("frequencyWarning", { frequency: warning.frequency?.toFixed(1) ?? "—", names, threshold: warning.threshold })}</li>;
                      }
                      return <li key={`audience-warning-${warning.kind}-${warning.audienceIds.join("-")}`}>{t("overlapWarning", { names, threshold: warning.threshold })}</li>;
                    })}
                  </ul>
                </div>
              </div>
            </div>
          )}
          {audienceLadder.length > 0 && (
            <div className="border-b border-border px-5 py-4">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("windowScale")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {audienceLadder.map((audience) => (
                  <span key={`ladder-${audience.adSetId}`} className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold">
                    {audience.windowDays} {locale === "en" ? "days" : "j"} · {audience.cpaCents === null ? "CPA —" : `CPA ${formatEur(audience.cpaCents / 100, locale)}`}
                  </span>
                ))}
              </div>
            </div>
          )}
          {detail.audiences.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t("noAdSets")}</p>
          ) : (
            <table className="w-full min-w-[52rem] text-xs">
              <thead>
                <tr className="border-b border-border text-left font-bold text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-4 py-3">{t("adSet")}</th>
                  <th className="px-4 py-3">{t("includedAudiences")}</th>
                  <th className="px-4 py-3">{t("exclusions")}</th>
                  <th className="px-4 py-3">{t("windowStatus")}</th>
                  <th className="px-4 py-3 text-right">CPA</th>
                </tr>
              </thead>
              <tbody>
                {detail.audiences.map((audience) => (
                  <tr key={audience.adSetId} className="border-b border-border last:border-0 align-top">
                    <td className="sticky left-0 z-10 bg-card px-4 py-3 font-bold"><a href={audience.deepLink} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{audience.adSetName}</a></td>
                    <td className="px-4 py-3">{audience.included.length > 0 ? audience.included.join(", ") : audience.targetingAvailable ? t("unnamedTargeting") : "—"}</td>
                    <td className="px-4 py-3">{audience.excluded.length > 0 ? audience.excluded.join(", ") : audience.targetingAvailable ? t("noExclusion") : "—"}</td>
                    <td className="px-4 py-3">{audience.windowDays === null ? t("windowUnknown") : `${audience.windowDays} ${locale === "en" ? "days" : "jours"} · ${locale === "en" ? "inferred from label" : "déduite du libellé"}`} · {audience.active ? t("active") : t("inactive")}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <TableMetric value={audience.cpaCents === null ? "—" : formatEur(audience.cpaCents / 100, locale)} provenance={metricProvenance("Meta", "dérivée", audience.cpaCents !== null, "directe", locale)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">{t("audienceFootnote")}</p>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="sticker-card p-6" aria-labelledby="daily-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="daily-title" className="font-bold">{t("dailySpend")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("dailyHelp")}</p>
            </div>
            <Gauge className="size-5 text-accent-2" />
          </div>
          <div className="mt-5 flex h-44 items-end gap-1 overflow-x-auto border-b border-border pb-2" tabIndex={0} role="region" aria-label={t("dailyChart")}>
            {detail.daily.length === 0 ? (
              <p className="pb-3 text-sm text-muted-foreground">{t("noDaily")}</p>
            ) : detail.daily.map((point) => (
              <div key={point.date} className="group flex h-full min-w-3 flex-1 flex-col justify-end" title={`${point.date} · ${point.spendCents === null ? t("dataUnavailable") : formatEur(point.spendCents / 100, locale)}`}>
                {point.spendCents !== null && <div className="min-h-1 rounded-t bg-accent-2 transition-opacity group-hover:opacity-70" style={{ height: `${Math.max(3, (point.spendCents / maxSpend) * 100)}%` }} />}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{detail.daily[0]?.date ?? "—"}</span>
            <span>{detail.daily.at(-1)?.date ?? "—"}</span>
          </div>
          <div className="mt-5 overflow-x-auto rounded-[var(--radius-control)] border border-border" tabIndex={0} role="region" aria-label={t("dailyTable")}>
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr className="border-b border-border text-left font-bold text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-3 py-2">{t("day")}</th>
                  <th className="px-3 py-2 text-right">{t("spend")}</th>
                  <th className="px-3 py-2 text-right">{t("impressions")}</th>
                  <th className="px-3 py-2 text-right">{t("linkClicks")}</th>
                  <th className="px-3 py-2 text-right">{t("leads")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.daily.map((point) => (
                  <tr key={`daily-row-${point.date}`} className="border-b border-border last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-bold">{point.date}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <TableMetric value={point.spendCents === null ? "—" : formatEur(point.spendCents / 100, locale)} provenance={metricProvenance("Meta", "brute", point.spendCents !== null, "directe", locale)} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <TableMetric value={point.impressions === null ? "—" : point.impressions.toLocaleString(locale)} provenance={metricProvenance("Meta", "brute", point.impressions !== null, "directe", locale)} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <TableMetric value={point.linkClicks === null ? "—" : point.linkClicks.toLocaleString(locale)} provenance={metricProvenance("Meta", "brute", point.linkClicks !== null, "directe", locale)} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <TableMetric value={point.leads === null ? "—" : point.leads.toLocaleString(locale)} provenance={metricProvenance("Meta", "brute", point.leads !== null, "directe", locale)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="sticker-card p-6" aria-labelledby="funnel-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="funnel-title" className="font-bold">{t("funnel")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("funnelHelp")}</p>
            </div>
            {!campaignConfigured ? <Gauge className="size-5 text-accent-2" /> : detail.campaign.campaignType === "vsl" ? <Play className="size-5 text-accent-2" /> : detail.campaign.campaignType === "instagram_profile_growth" ? <UserPlus className="size-5 text-accent-2" /> : <MousePointerClick className="size-5 text-accent-2" />}
          </div>
          <div className="mt-5 space-y-4">
            <ProgressRow locale={locale} label={locale === "en" ? "Click / impression" : "Clic / impression"} numerator={linkClicks} denominator={impressions} unavailableReason={locale === "en" ? "Meta clicks or impressions unavailable for this period" : "Clics ou impressions Meta indisponibles sur la période"} />
            {!campaignConfigured && <p className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">{t("genericFunnel")}</p>}
            {campaignConfigured && detail.campaign.campaignType === "vsl" && <ProgressRow locale={locale} label={locale === "en" ? "3-sec view" : "Vue 3 sec."} numerator={video3sViews} denominator={impressions} unavailableReason={locale === "en" ? "Meta video source unavailable for this period" : "Source vidéo Meta indisponible sur la période"} />}
            {campaignConfigured && detail.campaign.campaignType === "vsl" && <ProgressRow locale={locale} label="ThruPlay / view" numerator={videoThruplay} denominator={video3sViews} unavailableReason={locale === "en" ? "Meta video source unavailable for this period" : "Source vidéo Meta indisponible sur la période"} />}
            {campaignConfigured && detail.campaign.campaignType === "vsl" && <p className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">{t("vslUnavailable")}</p>}
            {campaignConfigured && detail.campaign.campaignType === "vsl" && <ProgressRow locale={locale} label={conversionMetricLabel} numerator={conversionMetricValue} denominator={conversionMetricBase} unavailableReason={conversionUnavailableReason} />}
            {campaignConfigured && detail.campaign.campaignType === "instagram_profile_growth" && <ProgressRow locale={locale} label={locale === "en" ? "Follow / visit" : "Follow / visite"} numerator={observedFollows} denominator={profileVisits} unavailableReason={detail.dashboard.instagramObservation.connected ? (locale === "en" ? "Instagram observation unavailable for this period" : "Observation Instagram indisponible sur la période") : (locale === "en" ? "Missing source: Instagram connection" : "Source manquante : connexion Instagram")} />}
            {campaignConfigured && detail.campaign.campaignType === "instagram_profile_growth" && <p className="text-xs text-muted-foreground">{t("instagramCost", { cost: spendCents !== null && observedFollows !== null && observedFollows > 0 ? formatEur(spendCents / observedFollows / 100, locale) : "—" })} · {detail.dashboard.instagramObservation.connected ? t("instagramSeparate") : t("instagramConnect")}</p>}
            {campaignConfigured && detail.campaign.campaignType === "webinar" && (
              <>
                <ProgressRow locale={locale} label={locale === "en" ? "Registrations" : "Inscriptions"} numerator={registrations} denominator={linkClicks} unavailableReason={locale === "en" ? "Meta registrations unavailable for this period" : "Inscriptions Meta indisponibles sur la période"} />
                <ProgressRow locale={locale} label={locale === "en" ? "Attendees" : "Présents"} numerator={webinarParticipants} denominator={registrations} unavailableReason={locale === "en" ? "Missing source: webinar attendance event" : "Source manquante : événement de présence du webinar"} />
                {webinarParticipants === null ? (
                  <p className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
                    {t("webinarUnavailable")}
                  </p>
                ) : (
                  <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                    {t("webinarObserved", { source: webinarObservation ? webinarSourceLabel(webinarObservation.source) : (locale === "en" ? "the webinar source" : "la source webinar") })}
                  </p>
                )}
                <ProgressRow locale={locale} label={conversionMetricLabel} numerator={conversionMetricValue} denominator={conversionMetricBase} unavailableReason={conversionUnavailableReason} />
              </>
            )}
            {campaignConfigured && detail.campaign.campaignType === "retargeting" && (
              <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                {t("frequencySummary", { value: ratio(impressions, metricValue(metrics, "reach"))?.toFixed(1) ?? "—", threshold: detail.dashboard.frequencySaturationThreshold })} {ratio(impressions, metricValue(metrics, "reach")) !== null && (ratio(impressions, metricValue(metrics, "reach")) ?? 0) > detail.dashboard.frequencySaturationThreshold ? t("saturationSignal") : t("noSaturation")} {t("reachNotDedupedAudience")}
              </p>
            )}
            <FunnelTable rows={funnelRows} locale={locale} labels={funnelTableLabels} />
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="insights-title">
        <div>
          <h2 id="insights-title" className="text-xl font-bold">{t("actionableInsights")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("insightsHelp")}</p>
        </div>
        {currentInsights.length === 0 ? (
          <div className="sticker-card-dashed p-5 text-sm text-muted-foreground">{t("noActionable")}</div>
        ) : currentInsights.map((insight) => <MetaInsightCard key={insight.id} {...insight} />)}
      </section>

      <section className="sticker-card overflow-x-auto" aria-labelledby="ads-title" tabIndex={0} role="region">
        <div className="border-b border-border px-5 py-4">
          <h2 id="ads-title" className="font-bold">{t("creativeMatrix")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t("creativeHelp")}</p>
        </div>
        <table className="w-full min-w-[70rem] text-sm">
          <thead>
              <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-5 py-3">{t("rank")}</th>
              <th className="px-5 py-3">{t("name")}</th>
              <th className="px-5 py-3">{t("level")}</th>
              <th className="px-5 py-3 text-right">{t("spend")}</th>
              <th className="px-5 py-3 text-right">{t("budgetShare")}</th>
              <th className="px-5 py-3 text-right">{t("linkCtr")}</th>
              <th className="px-5 py-3 text-right">{t("frequency") }*</th>
              <th className="px-5 py-3 text-right">{t("leads")}</th>
              <th className="px-5 py-3 text-right">CPL</th>
              <th className="px-5 py-3 text-right">{t("signal")}</th>
              <th className="px-5 py-3 text-right">{t("action")}</th>
            </tr>
          </thead>
          <tbody>
            {detail.adSets.map((row, index) => (
              <tr key={`set-${row.id}`} className="border-b border-border">
                {(() => {
                  const rowImpressions = metricValue(row.metrics, "impressions");
                  const rowLinkClicks = metricValue(row.metrics, "linkClicks");
                  const rowReach = metricValue(row.metrics, "reach");
                  const rowSpend = metricValue(row.metrics, "spendCents");
                  const rowLeads = metricValue(row.metrics, "leads");
                  const rowBudgetShare = ratio(rowSpend, spendCents);
                  const rowCtr = ratio(rowLinkClicks, rowImpressions);
                  const rowFrequency = ratio(rowImpressions, rowReach);
                  const rowCpa = creativeCpaCents(row);
                  return (
                    <>
                <td className="sticky left-0 z-10 bg-card px-5 py-3 text-xs font-bold text-muted-foreground">{index + 1}</td>
                <td className="px-5 py-3 font-bold"><a href={row.deepLink} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{row.name}</a></td>
                <td className="px-5 py-3 text-muted-foreground">{t("adSet")}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowSpend === null ? "—" : formatEur(rowSpend / 100, locale)} provenance={metricProvenance("Meta", "brute", rowSpend !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowBudgetShare === null ? "—" : formatPercent(rowBudgetShare, locale)} provenance={metricProvenance("Meta", "dérivée", rowBudgetShare !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowCtr === null ? "—" : formatPercent(rowCtr, locale)} provenance={metricProvenance("Meta", "dérivée", rowCtr !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowFrequency === null ? "—" : rowFrequency.toFixed(1)} provenance={metricProvenance("Meta", "dérivée", rowFrequency !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowLeads === null ? "—" : rowLeads.toLocaleString(locale)} provenance={metricProvenance("Meta", "brute", rowLeads !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowCpa === null ? "—" : formatEur(rowCpa / 100, locale)} provenance={metricProvenance("Meta", "dérivée", rowCpa !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right text-xs font-bold text-muted-foreground">{row.status ?? "—"}{rowImpressions !== null && rowReach !== null && (ratio(rowImpressions, rowReach) ?? 0) >= detail.dashboard.frequencySaturationThreshold ? ` · ${t("frequencyCheck", { value: detail.dashboard.frequencySaturationThreshold })}` : ""}</td>
                <td className="px-5 py-3 text-right">
                  <MetaEntityAction entityType="adset" entityId={row.id} campaignId={detail.campaign.id} status={row.status} deepLink={row.deepLink} hasWriteAccess={hasWriteAccess} accountLabel={detail.dashboard.account.name} returnTo={`/acquisition/ads/meta/${detail.campaign.id}?${periodQuery}`} />
                </td>
                    </>
                  );
                })()}
              </tr>
            ))}
            {rankedAds.map((row, index) => (
              <tr key={`ad-${row.id}`} className="border-b border-border last:border-0">
                {(() => {
                  const rowImpressions = metricValue(row.metrics, "impressions");
                  const rowLinkClicks = metricValue(row.metrics, "linkClicks");
                  const rowReach = metricValue(row.metrics, "reach");
                  const rowSpend = metricValue(row.metrics, "spendCents");
                  const rowLeads = metricValue(row.metrics, "leads");
                  const rowBudgetShare = ratio(rowSpend, spendCents);
                  const rowCtr = ratio(rowLinkClicks, rowImpressions);
                  const rowFrequency = ratio(rowImpressions, rowReach);
                  const rowCpa = creativeCpaCents(row);
                  return (
                    <>
                <td className="sticky left-0 z-10 bg-card px-5 py-3 text-xs font-bold text-muted-foreground">{index + 1}</td>
                <td className="px-5 py-3"><a href={row.deepLink} target="_blank" rel="noopener noreferrer" className="font-bold underline-offset-4 hover:underline">{row.name}</a>{row.creativeName && <span className="ml-2 text-xs text-muted-foreground">· {row.creativeName}</span>}</td>
                <td className="px-5 py-3 text-muted-foreground">{t("ad")}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowSpend === null ? "—" : formatEur(rowSpend / 100, locale)} provenance={metricProvenance("Meta", "brute", rowSpend !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowBudgetShare === null ? "—" : formatPercent(rowBudgetShare, locale)} provenance={metricProvenance("Meta", "dérivée", rowBudgetShare !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowCtr === null ? "—" : formatPercent(rowCtr, locale)} provenance={metricProvenance("Meta", "dérivée", rowCtr !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowFrequency === null ? "—" : rowFrequency.toFixed(1)} provenance={metricProvenance("Meta", "dérivée", rowFrequency !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowLeads === null ? "—" : rowLeads.toLocaleString(locale)} provenance={metricProvenance("Meta", "brute", rowLeads !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  <TableMetric value={rowCpa === null ? "—" : formatEur(rowCpa / 100, locale)} provenance={metricProvenance("Meta", "dérivée", rowCpa !== null, "directe", locale)} />
                </td>
                <td className="px-5 py-3 text-right text-xs font-bold text-muted-foreground">{row.status ?? "—"}{rowImpressions !== null && rowReach !== null && (ratio(rowImpressions, rowReach) ?? 0) >= detail.dashboard.frequencySaturationThreshold ? ` · ${t("frequencyCheckReview", { value: detail.dashboard.frequencySaturationThreshold })}` : ""}</td>
                <td className="px-5 py-3 text-right">
                  <MetaEntityAction entityType="ad" entityId={row.id} campaignId={detail.campaign.id} status={row.status} deepLink={row.deepLink} hasWriteAccess={hasWriteAccess} accountLabel={detail.dashboard.account.name} returnTo={`/acquisition/ads/meta/${detail.campaign.id}?${periodQuery}`} />
                </td>
                    </>
                  );
                })()}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
