import { ArrowLeft, CircleAlert, ExternalLink, Gauge, MousePointerClick, Play, UserPlus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MetaCampaignActions } from "@/components/meta-ads/meta-campaign-actions";
import { MetaEntityAction } from "@/components/meta-ads/meta-entity-action";
import { MetaCampaignProfileSelector } from "@/components/meta-ads/meta-campaign-profile-selector";
import { MetaCampaignTargets } from "@/components/meta-ads/meta-campaign-targets";
import { MetaInsightCard } from "@/components/meta-ads/meta-insight-card";
import { MetaTouchpointGenerator } from "@/components/meta-ads/meta-touchpoint-generator";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import { getCurrentUser } from "@/lib/current-user";
import { getBusinessProfile } from "@/lib/business/queries";
import { META_INSIGHT_THRESHOLDS } from "@/lib/meta-ads/thresholds";
import { buildMetaAudienceWarnings } from "@/lib/meta-ads/audience-warnings";
import { buildMetaAdsInsights, materializeMetaAdsInsights } from "@/lib/meta-ads/insights";
import { metaAdsErrorMessage } from "@/lib/meta-ads/messages";
import { getMetaAdsDashboard, getMetaCampaignDetail, metricValue } from "@/lib/meta-ads/queries";
import { trendLabel } from "@/lib/meta-ads/metric-comparison";
import { metaAdsManagerUrl, normalizeMetaPeriodDays } from "@/lib/meta-ads/protocol";
import { targetVarianceLabel } from "@/lib/meta-ads/targets";
import { formatPercent } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;
}

function typeLabel(value: string): string {
  if (value === "vsl") return "VSL";
  if (value === "webinar") return "Webinaire";
  if (value === "instagram_profile_growth") return "Followers Instagram";
  if (value === "retargeting") return "Retargeting";
  return "Autre";
}

function actionLabel(value: string): string {
  if (value === "pause") return "Pause";
  if (value === "resume") return "Reprise";
  if (value === "set_daily_budget") return "Budget quotidien";
  return value;
}

function actionStatusLabel(value: string): string {
  if (value === "succeeded") return "Réussie";
  if (value === "failed") return "Échouée";
  if (value === "permission_insufficient") return "Permission insuffisante";
  if (value === "changed_between_proposal") return "Modifiée entre-temps";
  if (value === "unknown") return "État inconnu";
  if (value === "blocked") return "Bloquée";
  if (value === "in_progress") return "En cours";
  return value;
}

function actionStateLabel(state: Record<string, unknown>): string {
  const status = typeof state.status === "string" ? state.status : null;
  const budget = typeof state.daily_budget === "number" || typeof state.daily_budget === "string" ? String(state.daily_budget) : null;
  if (status && budget) return `${status} · ${budget} cents/jour`;
  return status ?? (budget ? `${budget} cents/jour` : "—");
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

function metricProvenance(
  source: string,
  calculation: "brute" | "dérivée",
  available: boolean,
  attribution: "directe" | "jointe" = "directe",
): string {
  return `${source} · ${calculation} · ${available ? attribution : "indisponible"}`;
}

function ProgressRow({ label, numerator, denominator }: { label: string; numerator: number | null; denominator: number | null }) {
  const rate = ratio(numerator, denominator);
  const width = rate === null ? 0 : Math.min(100, Math.max(3, rate * 100));
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 text-xs font-bold text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 rounded-full bg-muted">
        {rate !== null && <div className="h-2 rounded-full bg-accent-2" style={{ width: `${width}%` }} />}
      </div>
      <span className="w-16 text-right text-xs font-bold tabular-nums">{rate === null ? "—" : formatPercent(rate)}</span>
    </div>
  );
}

type FunnelTableRow = {
  label: string;
  numerator: number | null;
  denominator: number | null;
  unavailableReason?: string;
};

function FunnelTable({ rows }: { rows: FunnelTableRow[] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-[var(--radius-control)] border border-border" tabIndex={0} role="region" aria-label="Lecture tabulaire du funnel de campagne">
      <table className="w-full min-w-[32rem] text-xs">
        <caption className="sr-only">Lecture tabulaire du funnel</caption>
        <thead>
          <tr className="border-b border-border text-left font-bold text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card px-3 py-2">Étape</th>
            <th className="px-3 py-2 text-right">Valeur</th>
            <th className="px-3 py-2 text-right">Taux</th>
            <th className="px-3 py-2">Disponibilité</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rate = ratio(row.numerator, row.denominator);
            return (
              <tr key={row.label} className="border-b border-border last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-bold">{row.label}</th>
                <td className="px-3 py-2 text-right tabular-nums">{row.numerator === null ? "—" : row.numerator.toLocaleString("fr-FR")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{rate === null ? "—" : formatPercent(rate)}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.unavailableReason ?? (row.numerator === null ? "Indisponible sur la période" : "Mesurée")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function MetaCampaignDetailPage({ params, searchParams }: { params: Promise<{ campaignId: string }>; searchParams: Promise<{ meta_days?: string; meta_ads?: string; meta_ads_error?: string }> }) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:ads");
  const { campaignId } = await params;
  const search = await searchParams;
  const metaAdsErrorMessageText = metaAdsErrorMessage(search.meta_ads_error);
  const periodDays = normalizeMetaPeriodDays(search.meta_days);
  const [dashboard, businessProfile] = await Promise.all([
    getMetaAdsDashboard(accountId, periodDays),
    getBusinessProfile(accountId),
  ]);
  if (!dashboard) notFound();
  if (periodDays !== 30) {
    try {
      await materializeMetaAdsInsights(accountId, dashboard, campaignId);
    } catch (error) {
      console.error("Meta Ads insight refresh for selected period failed", error instanceof Error ? error.message : "unknown");
    }
  }
  const detail = await getMetaCampaignDetail(accountId, campaignId, periodDays, dashboard);
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
  const purchaseValueCents = metricValue(metrics, "purchaseValueCents");
  const ctr = ratio(linkClicks, impressions);
  const comparisonCtr = ratio(comparisonLinkClicks, comparisonImpressions);
  const cpc = linkClicks !== null && linkClicks > 0 && spendCents !== null ? spendCents / linkClicks / 100 : null;
  const comparisonCpc = comparisonLinkClicks !== null && comparisonLinkClicks > 0 && comparisonSpendCents !== null ? comparisonSpendCents / comparisonLinkClicks / 100 : null;
  const cpl = leads !== null && leads > 0 && spendCents !== null ? spendCents / leads / 100 : null;
  const comparisonCpl = comparisonLeads !== null && comparisonLeads > 0 && comparisonSpendCents !== null ? comparisonSpendCents / comparisonLeads / 100 : null;
  const cplDetail = detail.campaign.campaignType === "instagram_profile_growth"
    ? "Non applicable pour ce type · utilise le coût / follower observé"
    : leads === null
      ? "Leads Meta indisponibles sur la période"
      : leads === 0
        ? "Aucun lead mesuré sur la période"
        : spendCents === null
          ? `${leads.toLocaleString("fr-FR")} lead(s) · dépenses Meta indisponibles`
          : `${leads.toLocaleString("fr-FR")} lead(s)`;
  const instagramGrowth = detail.campaign.campaignType === "instagram_profile_growth";
  const metaRoas = !instagramGrowth && purchaseValueCents !== null && spendCents !== null && spendCents > 0 ? purchaseValueCents / spendCents : null;
  const comparisonPurchaseValueCents = metricValue(comparisonMetrics, "purchaseValueCents");
  const comparisonRoas = comparisonPurchaseValueCents !== null && comparisonSpendCents !== null && comparisonSpendCents > 0 ? comparisonPurchaseValueCents / comparisonSpendCents : null;
  const maxSpend = Math.max(1, ...detail.daily.map((point) => point.spendCents ?? 0));
  const targets = detail.campaign.targets ?? { targetCpaCents: null, targetRoas: null, leadValueCents: null };
  const targetCpaEuros = targets.targetCpaCents === null ? null : targets.targetCpaCents / 100;
  const cplApplicable = !instagramGrowth;
  const cplTargetLabel = cplApplicable ? targetVarianceLabel(cpl, targetCpaEuros) : null;
  const roasTargetLabel = targetVarianceLabel(metaRoas, targets.targetRoas);
  const leadValueLabel = targets.leadValueCents === null ? null : `Valeur lead ${formatEur(targets.leadValueCents / 100)}`;
  const mainOffer = businessProfile.sales.offers.find((offer) => offer.isMain && offer.price !== null);
  const managerUrl = metaAdsManagerUrl(detail.dashboard.account.externalId, detail.campaign.externalId);
  const attribution = detail.attributionQuality;
  const attributionLabel = attribution.status === "verified" ? "Vérifiée" : attribution.status === "partial" ? "Partielle" : "Non calculable";
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
    { label: "Clic / impression", numerator: linkClicks, denominator: impressions },
  ];
  if (detail.campaign.campaignType === "vsl") {
    funnelRows.push(
      { label: "Vue 3 sec.", numerator: video3sViews, denominator: impressions },
      { label: "ThruPlay / vue", numerator: videoThruplay, denominator: video3sViews },
      { label: "Lecture VSL", numerator: null, denominator: null, unavailableReason: "Source manquante : événements de lecture de la page VSL" },
      { label: "Watch depth", numerator: null, denominator: null, unavailableReason: "Source manquante : événements de progression de la page VSL" },
    );
  }
  if (detail.campaign.campaignType === "webinar") {
    funnelRows.push(
      { label: "Inscriptions", numerator: registrations, denominator: linkClicks },
      { label: "Présence live", numerator: null, denominator: registrations, unavailableReason: "Source manquante : événement de présence du webinar" },
      { label: "Présence jusqu'au pitch", numerator: null, denominator: registrations, unavailableReason: "Source manquante : événement de progression du webinar" },
    );
  }
  if (detail.campaign.campaignType === "instagram_profile_growth") {
    funnelRows.push({ label: "Follow / visite", numerator: observedFollows, denominator: profileVisits, unavailableReason: detail.dashboard.instagramObservation.connected ? undefined : "Source manquante : connexion Instagram" });
  }
  if (detail.campaign.campaignType === "retargeting") {
    funnelRows.push({ label: "Fréquence", numerator: impressions, denominator: metricValue(metrics, "reach") });
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" asChild className="mb-3 -ml-2">
            <Link href="/acquisition/ads"><ArrowLeft className="size-4" />Retour aux Ads</Link>
          </Button>
          <p className="text-xs font-bold tracking-wide text-accent-2 uppercase">Meta Ads · {typeLabel(detail.campaign.campaignType)}</p>
          <h1 className="mt-1 text-3xl font-bold">{detail.campaign.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{detail.dashboard.period.start} → {detail.dashboard.period.end} · {detail.campaign.objective ?? "Objectif Meta non renseigné"}</p>
          <p className="mt-1 text-xs text-muted-foreground">Comparaison : {detail.dashboard.comparisonPeriod.start} → {detail.dashboard.comparisonPeriod.end} · même durée précédente.</p>
          <p className="mt-2 text-xs font-bold text-muted-foreground">
            {detail.dashboard.period.consolidatedThrough
              ? `Chiffres définitifs jusqu’au ${new Intl.DateTimeFormat("fr-FR").format(new Date(`${detail.dashboard.period.consolidatedThrough}T12:00:00Z`))}.`
              : "Fenêtre de consolidation en cours · les chiffres récents peuvent évoluer."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Couverture de lecture Meta : {detail.campaign.metricCoverageRate === null || detail.campaign.metricCoverageRate === undefined ? "—" : formatPercent(detail.campaign.metricCoverageRate)} des jours de la période · les jours manquants restent indisponibles.
          </p>
          {detail.dashboard.missingMetricDates.length > 0 && (
            <p className="mt-1 text-xs font-bold text-state-caution" role="status">
              Jours sans série Meta synchronisée pour le compte : {detail.dashboard.missingMetricDates.slice(0, 8).join(", ")}{detail.dashboard.missingMetricDates.length > 8 ? ` · +${detail.dashboard.missingMetricDates.length - 8} autre(s)` : ""}.
            </p>
          )}
        </div>
        <Button asChild variant="outline">
          <a href={managerUrl} target="_blank" rel="noopener noreferrer">
            Ouvrir dans Meta Ads <ExternalLink className="size-4" />
          </a>
        </Button>
      </div>

      <MetaCampaignProfileSelector
        campaignId={detail.campaign.id}
        campaignType={detail.campaign.campaignType}
        typeSource={detail.campaign.typeSource}
      />

      {metaAdsErrorMessageText && (
        <div className="rounded-[var(--radius-control)] border border-state-critical/40 bg-state-critical/10 px-4 py-3 text-sm font-bold text-state-critical" role="alert">
          {metaAdsErrorMessageText}
        </div>
      )}
      {search.meta_ads === "write_declined" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-4 py-3 text-sm text-state-caution" role="status">
          <span>La permission d&apos;écriture n&apos;a pas été accordée. La lecture reste active.</span>
          <a href={managerUrl} target="_blank" rel="noopener noreferrer" className="font-bold underline-offset-4 hover:underline">
            Ouvrir dans Meta Ads
          </a>
        </div>
      )}
      {search.meta_ads === "write_ready" && (
        <p className="rounded-[var(--radius-control)] border border-state-healthy/30 bg-state-healthy-bg px-4 py-3 text-sm font-bold text-state-healthy" role="status">
          Permission d&apos;écriture accordée. Relis la proposition conservée puis confirme l&apos;action.
        </p>
      )}

      <MetaCampaignTargets
        campaignId={detail.campaign.id}
        targetCpaCents={targets.targetCpaCents}
        targetRoas={targets.targetRoas}
        leadValueCents={targets.leadValueCents}
        suggestedLeadValueCents={mainOffer?.price === null || mainOffer?.price === undefined ? null : Math.round(mainOffer.price * 100)}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-7">
        <Metric label="Dépenses" value={spendCents === null ? "—" : formatEur(spendCents / 100)} detail={`${impressions === null ? "—" : impressions.toLocaleString("fr-FR")} impressions`} comparison={trendLabel(spendCents, comparisonSpendCents)} provenance={metricProvenance("Meta", "brute", spendCents !== null)} />
        <Metric label="CTR lien" value={ctr === null ? "—" : formatPercent(ctr)} detail={`${linkClicks === null ? "—" : linkClicks.toLocaleString("fr-FR")} clics lien`} comparison={trendLabel(ctr, comparisonCtr)} provenance={metricProvenance("Meta", "dérivée", ctr !== null)} />
        <Metric label="CPC lien" value={cpc === null ? "—" : formatEur(cpc)} detail="Coût par clic sortant" comparison={trendLabel(cpc, comparisonCpc)} provenance={metricProvenance("Meta", "dérivée", cpc !== null)} />
        <Metric label="Coût / lead" value={!cplApplicable || cpl === null ? "—" : formatEur(cpl)} detail={[cplDetail, cplApplicable ? leadValueLabel : null, cplApplicable && targetCpaEuros !== null ? `Cible ${formatEur(targetCpaEuros)} · ${cplTargetLabel ?? "écart non calculable"}` : null].filter(Boolean).join(" · ")} comparison={cplApplicable ? trendLabel(cpl, comparisonCpl) : "Non applicable"} provenance={metricProvenance("Meta", "dérivée", cplApplicable && cpl !== null)} />
        <Metric label="ROAS Meta" value={instagramGrowth ? "—" : metaRoas === null ? "—" : `${metaRoas.toFixed(2)}×`} detail={instagramGrowth ? "Non applicable pour une campagne de croissance Instagram · objectif profil" : [purchaseValueCents === null ? "Valeur d’achat Meta indisponible" : `${formatEur(purchaseValueCents / 100)} de valeur d’achat`, targets.targetRoas === null ? null : `Cible ${targets.targetRoas.toFixed(2)}× · ${roasTargetLabel ?? "écart non calculable"}`].filter(Boolean).join(" · ")} comparison={instagramGrowth ? "Non applicable" : trendLabel(metaRoas, comparisonRoas)} provenance={metricProvenance("Meta", "dérivée", !instagramGrowth && metaRoas !== null)} />
        <Metric label="CA cash relié" value={attribution.revenueCents === null ? "—" : formatEur(attribution.revenueCents / 100)} detail={attribution.revenueCents === null ? "Couverture insuffisante" : `${attribution.sales.toLocaleString("fr-FR")} vente(s) Scale X`} provenance={metricProvenance("Stripe + Meta", "dérivée", attribution.revenueCents !== null, "jointe")} />
        <Metric label="Statut" value={detail.campaign.effectiveStatus ?? "—"} detail={detail.campaign.dailyBudgetCents === null ? "Budget Meta non exposé" : `${formatEur(detail.campaign.dailyBudgetCents / 100)} / jour`} provenance={metricProvenance("Meta", "brute", detail.campaign.effectiveStatus !== null)} />
      </div>

      <section className="sticker-card p-6" aria-labelledby="attribution-quality-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="attribution-quality-title" className="font-bold">Qualité de l&apos;attribution</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {attribution.status === "verified"
                ? "Au moins une vente est reliée à un touchpoint de cette campagne."
                : attribution.status === "partial"
                  ? "Le parcours est partiellement relié ; le chiffre d’affaires reste incomplet."
                  : "Aucune vente ne peut être reliée tant qu’un lien de suivi Scale X n’est pas utilisé."}
            </p>
          </div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{attributionLabel}</span>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Touchpoints" value={attribution.touchpoints.toLocaleString("fr-FR")} detail="Liens Scale X utilisés" provenance="Scale X · brute · directe" />
          <Metric label="Leads reliés" value={attribution.leads.toLocaleString("fr-FR")} detail="Formulaires attribués" provenance="Scale X · brute · jointe" />
          <Metric label="Appels reliés" value={attribution.bookedCalls.toLocaleString("fr-FR")} detail={`${attribution.closedCalls.toLocaleString("fr-FR")} closé(s)`} provenance="Scale X · brute · jointe" />
          <Metric label="Ventes reliées" value={attribution.sales.toLocaleString("fr-FR")} detail="Ventes avec touchpoint" provenance="Scale X · brute · jointe" />
          <Metric label="CA attribué" value={attribution.revenueCents === null ? "—" : formatEur(attribution.revenueCents / 100)} detail={attribution.revenueCents === null ? "Couverture insuffisante ou aucune vente reliée" : "Ventes reliées uniquement"} provenance={metricProvenance("Meta + Stripe", "dérivée", attribution.revenueCents !== null, "jointe")} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Niveau des touchpoints sur la période : {attribution.levels.ad} ad ({attribution.levelCoverage.ad === null ? "—" : formatPercent(attribution.levelCoverage.ad)}) · {attribution.levels.adset} ensemble ({attribution.levelCoverage.adset === null ? "—" : formatPercent(attribution.levelCoverage.adset)}) · {attribution.levels.campaign} campagne ({attribution.levelCoverage.campaign === null ? "—" : formatPercent(attribution.levelCoverage.campaign)}) · {attribution.levels.utm_seul} UTM seul ({attribution.levelCoverage.utm_seul === null ? "—" : formatPercent(attribution.levelCoverage.utm_seul)}).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Couverture des ventes du compte sur la période : {attribution.coverageRate === null ? "—" : formatPercent(attribution.coverageRate)} · {attribution.unattributedSalesInPeriod} vente(s) non rattachée(s) sur {attribution.salesInPeriod}.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Stripe reste consulté en lecture seule : Scale X n&apos;écrit pas de metadata après paiement. Les ventes sans touchpoint explicite restent non rattachées.
        </p>
      </section>

      <MetaCampaignActions
        campaignId={detail.campaign.id}
        status={detail.campaign.effectiveStatus}
        dailyBudgetCents={detail.campaign.dailyBudgetCents}
        hasWriteAccess={hasWriteAccess}
        accountLabel={detail.dashboard.account.name}
        deepLink={managerUrl}
        returnTo={`/acquisition/ads/meta/${detail.campaign.id}?meta_days=${periodDays}`}
      />

      <section className="sticker-card overflow-x-auto" aria-labelledby="meta-action-history-title" tabIndex={0} role="region">
        <div className="border-b border-border px-5 py-4">
          <h2 id="meta-action-history-title" className="font-bold">Historique des actions Meta</h2>
          <p className="mt-1 text-xs text-muted-foreground">Chaque tentative, y compris un refus ou une divergence, reste consultable ici et dans le Journal.</p>
        </div>
        {detail.actionLogs.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Aucune action directe enregistrée pour cette campagne.</p>
        ) : (
          <table className="w-full min-w-[48rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card px-5 py-3">Date</th>
                <th className="px-5 py-3">Niveau</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Avant / demandé</th>
                <th className="px-5 py-3">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {detail.actionLogs.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-5 py-3 text-xs text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(log.createdAt))}</td>
                  <td className="px-5 py-3 text-xs font-bold uppercase text-muted-foreground">{log.entityType}</td>
                  <td className="px-5 py-3 font-bold">{actionLabel(log.actionType)}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{actionStateLabel(log.requestedState)}</td>
                  <td className="px-5 py-3">
                    <p className="text-xs font-bold">{actionStatusLabel(log.status)}</p>
                    <p className="text-xs text-muted-foreground">{log.resultState ? actionStateLabel(log.resultState) : log.errorMessage ?? "—"}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <MetaTouchpointGenerator campaignId={detail.campaign.id} landingPageUrl={detail.campaign.landingPageUrl} />

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="sticker-card overflow-x-auto" aria-labelledby="placements-title" tabIndex={0} role="region">
          <div className="border-b border-border px-5 py-4">
            <h2 id="placements-title" className="font-bold">Placements</h2>
            <p className="mt-1 text-xs text-muted-foreground">Dépenses et réponse par plateforme/position renvoyées par les Insights Meta. Compteurs Meta · brute · directe ; CTR et fréquence · Meta · dérivée · directe.</p>
          </div>
          {detail.placements.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Placements indisponibles pour cette campagne ou cette permission Meta. Ouvre Meta Ads pour consulter le détail.</p>
          ) : (
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr className="border-b border-border text-left font-bold text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-4 py-3">Plateforme</th>
                  <th className="px-4 py-3">Position</th>
                  <th className="px-4 py-3 text-right">Dépenses</th>
                  <th className="px-4 py-3 text-right">CTR</th>
                  <th className="px-4 py-3 text-right">Fréquence</th>
                </tr>
              </thead>
              <tbody>
                {detail.placements.map((placement) => {
                  const placementSpend = metricValue(placement.metrics, "spendCents");
                  const placementImpressions = metricValue(placement.metrics, "impressions");
                  const placementClicks = metricValue(placement.metrics, "linkClicks");
                  const placementReach = metricValue(placement.metrics, "reach");
                  return (
                    <tr key={`${placement.publisherPlatform}:${placement.platformPosition}`} className="border-b border-border last:border-0">
                      <td className="sticky left-0 z-10 bg-card px-4 py-3 font-bold">{placement.publisherPlatform}</td>
                      <td className="px-4 py-3">{placement.platformPosition}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{placementSpend === null ? "—" : formatEur(placementSpend / 100)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{placementImpressions === null || placementClicks === null ? "—" : formatPercent(ratio(placementClicks, placementImpressions) ?? 0)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{placementImpressions === null || placementReach === null ? "—" : ratio(placementImpressions, placementReach)?.toFixed(1) ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">La fréquence est directionnelle quand le reach est additionné sur plusieurs jours ; vérifie le seuil de saturation {detail.dashboard.frequencySaturationThreshold}× dans Meta.</p>
        </section>

        <section className="sticker-card overflow-x-auto" aria-labelledby="audiences-title" tabIndex={0} role="region">
          <div className="border-b border-border px-5 py-4">
            <h2 id="audiences-title" className="font-bold">Audiences et exclusions</h2>
            <p className="mt-1 text-xs text-muted-foreground">Résumé du ciblage synchronisé par ensemble de publicités, avec accès direct à Meta. Ciblage et compteurs · Meta · brute · directe ; CPA · Meta · dérivée · directe.</p>
          </div>
          {audienceWarnings.length > 0 && (
            <div role="status" aria-live="polite" className="border-b border-state-caution/40 bg-state-caution/10 px-5 py-4 text-sm">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 size-5 shrink-0 text-state-caution" aria-hidden="true" />
                <div>
                  <p className="font-bold text-state-caution">Points de vigilance sur les ensembles actifs</p>
                  <ul className="mt-2 space-y-2 text-muted-foreground">
                    {audienceWarnings.map((warning) => {
                      const names = warning.audienceNames.join(" · ");
                      if (warning.kind === "insufficient_volume") {
                        const lowSignals = [
                          warning.impressions !== null && warning.impressions < META_INSIGHT_THRESHOLDS.minImpressions
                            ? `${warning.impressions.toLocaleString("fr-FR")} impressions (< ${META_INSIGHT_THRESHOLDS.minImpressions.toLocaleString("fr-FR")})`
                            : null,
                          warning.linkClicks !== null && warning.linkClicks < META_INSIGHT_THRESHOLDS.minClicks
                            ? `${warning.linkClicks.toLocaleString("fr-FR")} clics (< ${META_INSIGHT_THRESHOLDS.minClicks.toLocaleString("fr-FR")})`
                            : null,
                        ].filter((signal): signal is string => signal !== null);
                        return <li key={`audience-warning-${warning.kind}-${warning.audienceIds.join("-")}`}>Volume observé insuffisant pour {names} : {lowSignals.join(" et ")}. Ne conclus pas encore sur ce segment.</li>;
                      }
                      if (warning.kind === "frequency_saturation") {
                        return <li key={`audience-warning-${warning.kind}-${warning.audienceIds.join("-")}`}>Fréquence directionnelle de {warning.frequency?.toFixed(1) ?? "—"}× pour {names} : seuil de saturation {warning.threshold}× atteint. Vérifie le reach dédupliqué et les exclusions dans Meta.</li>;
                      }
                      return <li key={`audience-warning-${warning.kind}-${warning.audienceIds.join("-")}`}>Chevauchement probable entre {names} : mêmes audiences incluses/exclues sur au moins {warning.threshold} ensembles. C&apos;est une heuristique de ciblage, à confirmer dans Meta.</li>;
                    })}
                  </ul>
                </div>
              </div>
            </div>
          )}
          {audienceLadder.length > 0 && (
            <div className="border-b border-border px-5 py-4">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Échelle de fenêtres déduite</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {audienceLadder.map((audience) => (
                  <span key={`ladder-${audience.adSetId}`} className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold">
                    {audience.windowDays} j · {audience.cpaCents === null ? "CPA —" : `CPA ${formatEur(audience.cpaCents / 100)}`}
                  </span>
                ))}
              </div>
            </div>
          )}
          {detail.audiences.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Aucun ensemble synchronisé pour cette campagne.</p>
          ) : (
            <table className="w-full min-w-[52rem] text-xs">
              <thead>
                <tr className="border-b border-border text-left font-bold text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-4 py-3">Ensemble</th>
                  <th className="px-4 py-3">Audiences incluses</th>
                  <th className="px-4 py-3">Exclusions</th>
                  <th className="px-4 py-3">Fenêtre / statut</th>
                  <th className="px-4 py-3 text-right">CPA</th>
                </tr>
              </thead>
              <tbody>
                {detail.audiences.map((audience) => (
                  <tr key={audience.adSetId} className="border-b border-border last:border-0 align-top">
                    <td className="sticky left-0 z-10 bg-card px-4 py-3 font-bold"><a href={audience.deepLink} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{audience.adSetName}</a></td>
                    <td className="px-4 py-3">{audience.included.length > 0 ? audience.included.join(", ") : audience.targetingAvailable ? "Ciblage détaillé non nommé" : "—"}</td>
                    <td className="px-4 py-3">{audience.excluded.length > 0 ? audience.excluded.join(", ") : audience.targetingAvailable ? "Aucune exclusion nommée" : "—"}</td>
                    <td className="px-4 py-3">{audience.windowDays === null ? "Fenêtre non déduite" : `${audience.windowDays} jours · déduite du libellé`} · {audience.active ? "active" : "inactive"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{audience.cpaCents === null ? "—" : formatEur(audience.cpaCents / 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">Les fenêtres affichées sont déduites des libellés d’audience et servent de repère, pas de vérité Meta. Taille d’audience et chevauchement ne sont pas exposés par cette lecture ; vérifie-les dans Meta Ads avant de conclure.</p>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="sticker-card p-6" aria-labelledby="daily-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="daily-title" className="font-bold">Dépenses jour par jour</h2>
              <p className="mt-1 text-sm text-muted-foreground">Lecture de la cadence de dépense sur la période sélectionnée. Dépenses, impressions, clics et leads · Meta · brute · directe.</p>
            </div>
            <Gauge className="size-5 text-accent-2" />
          </div>
          <div className="mt-5 flex h-44 items-end gap-1 overflow-x-auto border-b border-border pb-2" tabIndex={0} role="region" aria-label="Graphique des dépenses quotidiennes">
            {detail.daily.length === 0 ? (
              <p className="pb-3 text-sm text-muted-foreground">Pas encore de données quotidiennes.</p>
            ) : detail.daily.map((point) => (
              <div key={point.date} className="group flex h-full min-w-3 flex-1 flex-col justify-end" title={`${point.date} · ${point.spendCents === null ? "donnée indisponible" : formatEur(point.spendCents / 100)}`}>
                {point.spendCents !== null && <div className="min-h-1 rounded-t bg-accent-2 transition-opacity group-hover:opacity-70" style={{ height: `${Math.max(3, (point.spendCents / maxSpend) * 100)}%` }} />}
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-muted-foreground">
            <span>{detail.daily[0]?.date ?? "—"}</span>
            <span>{detail.daily.at(-1)?.date ?? "—"}</span>
          </div>
          <div className="mt-5 overflow-x-auto rounded-[var(--radius-control)] border border-border" tabIndex={0} role="region" aria-label="Tableau des dépenses quotidiennes">
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr className="border-b border-border text-left font-bold text-muted-foreground">
                  <th className="sticky left-0 z-10 bg-card px-3 py-2">Jour</th>
                  <th className="px-3 py-2 text-right">Dépenses</th>
                  <th className="px-3 py-2 text-right">Impressions</th>
                  <th className="px-3 py-2 text-right">Clics lien</th>
                  <th className="px-3 py-2 text-right">Leads</th>
                </tr>
              </thead>
              <tbody>
                {detail.daily.map((point) => (
                  <tr key={`daily-row-${point.date}`} className="border-b border-border last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2 font-bold">{point.date}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{point.spendCents === null ? "—" : formatEur(point.spendCents / 100)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{point.impressions === null ? "—" : point.impressions.toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{point.linkClicks === null ? "—" : point.linkClicks.toLocaleString("fr-FR")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{point.leads === null ? "—" : point.leads.toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="sticker-card p-6" aria-labelledby="funnel-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="funnel-title" className="font-bold">Funnel de lecture</h2>
              <p className="mt-1 text-sm text-muted-foreground">Les taux sont calculés en code à partir des compteurs Meta · Meta · dérivée · directe.</p>
            </div>
            {detail.campaign.campaignType === "vsl" ? <Play className="size-5 text-accent-2" /> : detail.campaign.campaignType === "instagram_profile_growth" ? <UserPlus className="size-5 text-accent-2" /> : <MousePointerClick className="size-5 text-accent-2" />}
          </div>
          <div className="mt-5 space-y-4">
            <ProgressRow label="Clic / impression" numerator={linkClicks} denominator={impressions} />
            {detail.campaign.campaignType === "vsl" && <ProgressRow label="Vue 3 sec." numerator={video3sViews} denominator={impressions} />}
            {detail.campaign.campaignType === "vsl" && <ProgressRow label="ThruPlay / vue" numerator={videoThruplay} denominator={video3sViews} />}
            {detail.campaign.campaignType === "vsl" && <p className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">Lecture VSL et watch depth : indisponibles · source manquante : événements de lecture de la page VSL.</p>}
            {detail.campaign.campaignType === "instagram_profile_growth" && <ProgressRow label="Follow / visite" numerator={observedFollows} denominator={profileVisits} />}
            {detail.campaign.campaignType === "instagram_profile_growth" && <p className="text-xs text-muted-foreground">Coût / follower observé : {spendCents !== null && observedFollows !== null && observedFollows > 0 ? formatEur(spendCents / observedFollows / 100) : "—"} · Meta + Instagram · dérivée · estimée. {detail.dashboard.instagramObservation.connected ? "Les abonnements sont observés séparément, sans attribution directe." : "Étape indisponible · connecte Instagram pour observer les abonnements."}</p>}
            {detail.campaign.campaignType === "webinar" && (
              <>
                <ProgressRow label="Inscriptions" numerator={registrations} denominator={linkClicks} />
                <ProgressRow label="Présents" numerator={null} denominator={registrations} />
                <p className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-sm text-state-caution">
                  Présence live et présence jusqu&apos;au pitch : indisponibles · source manquante : événement du webinar.
                </p>
              </>
            )}
            {detail.campaign.campaignType === "retargeting" && (
              <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                Fréquence directionnelle : {ratio(impressions, metricValue(metrics, "reach"))?.toFixed(1) ?? "—"} · seuil de saturation : {detail.dashboard.frequencySaturationThreshold}. {ratio(impressions, metricValue(metrics, "reach")) !== null && (ratio(impressions, metricValue(metrics, "reach")) ?? 0) > detail.dashboard.frequencySaturationThreshold ? "Signal de saturation à vérifier dans Meta Ads." : "Aucun franchissement du seuil sur cette lecture."} Le reach additionné par jour n&apos;est pas dédupliqué ; confirme les exclusions d&apos;audience dans Meta.
              </p>
            )}
            <FunnelTable rows={funnelRows} />
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="insights-title">
        <div>
          <h2 id="insights-title" className="text-xl font-bold">Insights actionnables</h2>
          <p className="mt-1 text-sm text-muted-foreground">Une suggestion adoptée est ajoutée au Journal pour suivre sa mise en œuvre et son résultat.</p>
        </div>
        {currentInsights.length === 0 ? (
          <div className="sticker-card-dashed p-5 text-sm text-muted-foreground">Aucun signal actionnable détecté sur cette période avec les données disponibles.</div>
        ) : currentInsights.map((insight) => <MetaInsightCard key={insight.id} {...insight} />)}
      </section>

      <section className="sticker-card overflow-x-auto" aria-labelledby="ads-title" tabIndex={0} role="region">
        <div className="border-b border-border px-5 py-4">
          <h2 id="ads-title" className="font-bold">Matrice créative et ensembles</h2>
          <p className="mt-1 text-xs text-muted-foreground">Les créatifs sont classés par CPL lorsque des leads existent, puis par dépense. Compteurs Meta · brute · directe ; part budget, CTR, fréquence et CPL · Meta · dérivée · directe. Pour changer la créa ou le ciblage, ouvre Meta Ads.</p>
        </div>
        <table className="w-full min-w-[70rem] text-sm">
          <thead>
              <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
              <th className="sticky left-0 z-10 bg-card px-5 py-3">Rang</th>
              <th className="px-5 py-3">Nom</th>
              <th className="px-5 py-3">Niveau</th>
              <th className="px-5 py-3 text-right">Dépenses</th>
              <th className="px-5 py-3 text-right">Part budget</th>
              <th className="px-5 py-3 text-right">CTR lien</th>
              <th className="px-5 py-3 text-right">Fréquence*</th>
              <th className="px-5 py-3 text-right">Leads</th>
              <th className="px-5 py-3 text-right">CPL</th>
              <th className="px-5 py-3 text-right">Statut / signal</th>
              <th className="px-5 py-3 text-right">Action</th>
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
                  return (
                    <>
                <td className="sticky left-0 z-10 bg-card px-5 py-3 text-xs font-bold text-muted-foreground">{index + 1}</td>
                <td className="px-5 py-3 font-bold"><a href={row.deepLink} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{row.name}</a></td>
                <td className="px-5 py-3 text-muted-foreground">Ad set</td>
                <td className="px-5 py-3 text-right tabular-nums">{metricValue(row.metrics, "spendCents") === null ? "—" : formatEur((metricValue(row.metrics, "spendCents") ?? 0) / 100)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowSpend === null || spendCents === null ? "—" : formatPercent(ratio(rowSpend, spendCents) ?? 0)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowImpressions === null || rowLinkClicks === null ? "—" : formatPercent(ratio(rowLinkClicks, rowImpressions) ?? 0)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowImpressions === null || rowReach === null ? "—" : (ratio(rowImpressions, rowReach)?.toFixed(1) ?? "—")}</td>
                <td className="px-5 py-3 text-right tabular-nums">{metricValue(row.metrics, "leads") === null ? "—" : metricValue(row.metrics, "leads")}</td>
                <td className="px-5 py-3 text-right tabular-nums">{creativeCpaCents(row) === null ? "—" : formatEur(creativeCpaCents(row)! / 100)}</td>
                <td className="px-5 py-3 text-right text-xs font-bold text-muted-foreground">{row.status ?? "—"}{rowImpressions !== null && rowReach !== null && (ratio(rowImpressions, rowReach) ?? 0) >= detail.dashboard.frequencySaturationThreshold ? ` · fréquence ≥ ${detail.dashboard.frequencySaturationThreshold}×` : ""}</td>
                <td className="px-5 py-3 text-right">
                  <MetaEntityAction entityType="adset" entityId={row.id} campaignId={detail.campaign.id} status={row.status} deepLink={row.deepLink} hasWriteAccess={hasWriteAccess} accountLabel={detail.dashboard.account.name} returnTo={`/acquisition/ads/meta/${detail.campaign.id}?meta_days=${periodDays}`} />
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
                  return (
                    <>
                <td className="sticky left-0 z-10 bg-card px-5 py-3 text-xs font-bold text-muted-foreground">{index + 1}</td>
                <td className="px-5 py-3"><a href={row.deepLink} target="_blank" rel="noopener noreferrer" className="font-bold underline-offset-4 hover:underline">{row.name}</a>{row.creativeName && <span className="ml-2 text-xs text-muted-foreground">· {row.creativeName}</span>}</td>
                <td className="px-5 py-3 text-muted-foreground">Ad</td>
                <td className="px-5 py-3 text-right tabular-nums">{metricValue(row.metrics, "spendCents") === null ? "—" : formatEur((metricValue(row.metrics, "spendCents") ?? 0) / 100)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowSpend === null || spendCents === null ? "—" : formatPercent(ratio(rowSpend, spendCents) ?? 0)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowImpressions === null || rowLinkClicks === null ? "—" : formatPercent(ratio(rowLinkClicks, rowImpressions) ?? 0)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowImpressions === null || rowReach === null ? "—" : (ratio(rowImpressions, rowReach)?.toFixed(1) ?? "—")}</td>
                <td className="px-5 py-3 text-right tabular-nums">{metricValue(row.metrics, "leads") === null ? "—" : metricValue(row.metrics, "leads")}</td>
                <td className="px-5 py-3 text-right tabular-nums">{creativeCpaCents(row) === null ? "—" : formatEur(creativeCpaCents(row)! / 100)}</td>
                <td className="px-5 py-3 text-right text-xs font-bold text-muted-foreground">{row.status ?? "—"}{rowImpressions !== null && rowReach !== null && (ratio(rowImpressions, rowReach) ?? 0) >= detail.dashboard.frequencySaturationThreshold ? ` · fréquence ≥ ${detail.dashboard.frequencySaturationThreshold}× à vérifier` : ""}</td>
                <td className="px-5 py-3 text-right">
                  <MetaEntityAction entityType="ad" entityId={row.id} campaignId={detail.campaign.id} status={row.status} deepLink={row.deepLink} hasWriteAccess={hasWriteAccess} accountLabel={detail.dashboard.account.name} returnTo={`/acquisition/ads/meta/${detail.campaign.id}?meta_days=${periodDays}`} />
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
