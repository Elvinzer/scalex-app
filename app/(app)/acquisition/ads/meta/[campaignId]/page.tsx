import { ArrowLeft, ExternalLink, Gauge, MousePointerClick, Play, UserPlus } from "lucide-react";
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
import { getMetaCampaignDetail, metricValue } from "@/lib/meta-ads/queries";
import { metaAdsManagerUrl, normalizeMetaPeriodDays } from "@/lib/meta-ads/protocol";
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

function Metric({ label, value, detail, provenance }: { label: string; value: string; detail: string; provenance?: string }) {
  return (
    <div className="sticker-card p-5">
      <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      {provenance && <p className="mt-2 text-[11px] font-bold text-muted-foreground">{provenance}</p>}
    </div>
  );
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

export default async function MetaCampaignDetailPage({ params, searchParams }: { params: Promise<{ campaignId: string }>; searchParams: Promise<{ meta_days?: string; meta_ads?: string }> }) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:ads");
  const { campaignId } = await params;
  const search = await searchParams;
  const periodDays = normalizeMetaPeriodDays(search.meta_days);
  const [detail, businessProfile] = await Promise.all([
    getMetaCampaignDetail(accountId, campaignId, periodDays),
    getBusinessProfile(accountId),
  ]);
  if (!detail) notFound();

  const metrics = detail.campaign.metrics;
  const spendCents = metricValue(metrics, "spendCents");
  const impressions = metricValue(metrics, "impressions");
  const linkClicks = metricValue(metrics, "linkClicks");
  const leads = metricValue(metrics, "leads");
  const video3sViews = metricValue(metrics, "video3sViews");
  const videoThruplay = metricValue(metrics, "videoThruplay");
  const profileVisits = metricValue(metrics, "profileVisits");
  const observedFollows = detail.dashboard.instagramObservation.current.follows;
  const registrations = metricValue(metrics, "registrations");
  const purchaseValueCents = metricValue(metrics, "purchaseValueCents");
  const ctr = ratio(linkClicks, impressions);
  const cpl = leads !== null && leads > 0 && spendCents !== null ? spendCents / leads / 100 : null;
  const metaRoas = purchaseValueCents !== null && spendCents !== null && spendCents > 0 ? purchaseValueCents / spendCents : null;
  const maxSpend = Math.max(1, ...detail.daily.map((point) => point.spendCents ?? 0));
  const targets = detail.campaign.targets ?? { targetCpaCents: null, targetRoas: null, leadValueCents: null };
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

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button variant="ghost" asChild className="mb-3 -ml-2">
            <a href="/acquisition/ads"><ArrowLeft className="size-4" />Retour aux Ads</a>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Dépenses" value={spendCents === null ? "—" : formatEur(spendCents / 100)} detail={`${impressions === null ? "—" : impressions.toLocaleString("fr-FR")} impressions`} provenance="Meta · brute · directe" />
        <Metric label="CTR lien" value={ctr === null ? "—" : formatPercent(ctr)} detail={`${linkClicks === null ? "—" : linkClicks.toLocaleString("fr-FR")} clics lien`} provenance="Meta · dérivée · directe" />
        <Metric label="Coût / lead" value={cpl === null ? "—" : formatEur(cpl)} detail={`${leads === null ? "—" : leads.toLocaleString("fr-FR")} lead(s)`} provenance="Meta · dérivée · directe" />
        <Metric label="ROAS Meta" value={metaRoas === null ? "—" : `${metaRoas.toFixed(2)}×`} detail={purchaseValueCents === null ? "Valeur d’achat Meta indisponible" : `${formatEur(purchaseValueCents / 100)} de valeur d’achat`} provenance="Meta · dérivée · directe" />
        <Metric label="Statut" value={detail.campaign.effectiveStatus ?? "—"} detail={detail.campaign.dailyBudgetCents === null ? "Budget Meta non exposé" : `${formatEur(detail.campaign.dailyBudgetCents / 100)} / jour`} />
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
          <Metric label="Touchpoints" value={attribution.touchpoints.toLocaleString("fr-FR")} detail="Liens Scale X utilisés" />
          <Metric label="Leads reliés" value={attribution.leads.toLocaleString("fr-FR")} detail="Formulaires attribués" />
          <Metric label="Appels reliés" value={attribution.bookedCalls.toLocaleString("fr-FR")} detail={`${attribution.closedCalls.toLocaleString("fr-FR")} closé(s)`} />
          <Metric label="Ventes reliées" value={attribution.sales.toLocaleString("fr-FR")} detail="Ventes avec touchpoint" />
          <Metric label="CA attribué" value={attribution.revenueCents === null ? "—" : formatEur(attribution.revenueCents / 100)} detail={attribution.revenueCents === null ? "Couverture insuffisante ou aucune vente reliée" : "Ventes reliées uniquement"} provenance="Meta + Stripe · dérivée · jointe" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Niveau des touchpoints sur la période : {attribution.levels.ad} ad ({attribution.levelCoverage.ad === null ? "—" : formatPercent(attribution.levelCoverage.ad)}) · {attribution.levels.adset} ensemble ({attribution.levelCoverage.adset === null ? "—" : formatPercent(attribution.levelCoverage.adset)}) · {attribution.levels.campaign} campagne ({attribution.levelCoverage.campaign === null ? "—" : formatPercent(attribution.levelCoverage.campaign)}) · {attribution.levels.utm_seul} UTM seul ({attribution.levelCoverage.utm_seul === null ? "—" : formatPercent(attribution.levelCoverage.utm_seul)}).
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Couverture des ventes du compte sur la période : {attribution.coverageRate === null ? "—" : formatPercent(attribution.coverageRate)} · {attribution.unattributedSalesInPeriod} vente(s) non rattachée(s) sur {attribution.salesInPeriod}.
        </p>
      </section>

      <MetaCampaignActions
        campaignId={detail.campaign.id}
        status={detail.campaign.effectiveStatus}
        dailyBudgetCents={detail.campaign.dailyBudgetCents}
        hasWriteAccess={hasWriteAccess}
        accountLabel={detail.dashboard.account.name}
      />

      <section className="sticker-card overflow-x-auto" aria-labelledby="meta-action-history-title">
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
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Niveau</th>
                <th className="px-5 py-3">Action</th>
                <th className="px-5 py-3">Avant / demandé</th>
                <th className="px-5 py-3">Résultat</th>
              </tr>
            </thead>
            <tbody>
              {detail.actionLogs.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0">
                  <td className="px-5 py-3 text-xs text-muted-foreground">{new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(log.createdAt))}</td>
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
        <section className="sticker-card overflow-x-auto" aria-labelledby="placements-title">
          <div className="border-b border-border px-5 py-4">
            <h2 id="placements-title" className="font-bold">Placements</h2>
            <p className="mt-1 text-xs text-muted-foreground">Dépenses et réponse par plateforme/position renvoyées par les Insights Meta.</p>
          </div>
          {detail.placements.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">Placements indisponibles pour cette campagne ou cette permission Meta. Ouvre Meta Ads pour consulter le détail.</p>
          ) : (
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr className="border-b border-border text-left font-bold text-muted-foreground">
                  <th className="px-4 py-3">Plateforme</th>
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
                      <td className="px-4 py-3 font-bold">{placement.publisherPlatform}</td>
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
          <p className="border-t border-border px-5 py-3 text-[11px] text-muted-foreground">La fréquence est directionnelle quand le reach est additionné sur plusieurs jours ; vérifie le seuil de saturation 3× dans Meta.</p>
        </section>

        <section className="sticker-card overflow-x-auto" aria-labelledby="audiences-title">
          <div className="border-b border-border px-5 py-4">
            <h2 id="audiences-title" className="font-bold">Audiences et exclusions</h2>
            <p className="mt-1 text-xs text-muted-foreground">Résumé du ciblage synchronisé par ensemble de publicités, avec accès direct à Meta.</p>
          </div>
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
                  <th className="px-4 py-3">Ensemble</th>
                  <th className="px-4 py-3">Audiences incluses</th>
                  <th className="px-4 py-3">Exclusions</th>
                  <th className="px-4 py-3">Fenêtre / statut</th>
                  <th className="px-4 py-3 text-right">CPA</th>
                </tr>
              </thead>
              <tbody>
                {detail.audiences.map((audience) => (
                  <tr key={audience.adSetId} className="border-b border-border last:border-0 align-top">
                    <td className="px-4 py-3 font-bold"><a href={audience.deepLink} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{audience.adSetName}</a></td>
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
              <p className="mt-1 text-sm text-muted-foreground">Lecture de la cadence de dépense sur la période sélectionnée.</p>
            </div>
            <Gauge className="size-5 text-accent-2" />
          </div>
          <div className="mt-5 flex h-44 items-end gap-1 overflow-x-auto border-b border-border pb-2">
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
          <div className="mt-5 overflow-x-auto rounded-[var(--radius-control)] border border-border">
            <table className="w-full min-w-[34rem] text-xs">
              <thead>
                <tr className="border-b border-border text-left font-bold text-muted-foreground">
                  <th className="px-3 py-2">Jour</th>
                  <th className="px-3 py-2 text-right">Dépenses</th>
                  <th className="px-3 py-2 text-right">Impressions</th>
                  <th className="px-3 py-2 text-right">Clics lien</th>
                  <th className="px-3 py-2 text-right">Leads</th>
                </tr>
              </thead>
              <tbody>
                {detail.daily.map((point) => (
                  <tr key={`daily-row-${point.date}`} className="border-b border-border last:border-0">
                    <td className="px-3 py-2 font-bold">{point.date}</td>
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
              <p className="mt-1 text-sm text-muted-foreground">Les taux sont calculés en code à partir des compteurs Meta.</p>
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
                Fréquence directionnelle : {ratio(impressions, metricValue(metrics, "reach"))?.toFixed(1) ?? "—"} · seuil de saturation : 3. {ratio(impressions, metricValue(metrics, "reach")) !== null && (ratio(impressions, metricValue(metrics, "reach")) ?? 0) > 3 ? "Signal de saturation à vérifier dans Meta Ads." : "Aucun franchissement du seuil sur cette lecture."} Le reach additionné par jour n&apos;est pas dédupliqué ; confirme les exclusions d&apos;audience dans Meta.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-3" aria-labelledby="insights-title">
        <div>
          <h2 id="insights-title" className="text-xl font-bold">Insights actionnables</h2>
          <p className="mt-1 text-sm text-muted-foreground">Une suggestion adoptée est ajoutée au Journal pour suivre sa mise en œuvre et son résultat.</p>
        </div>
        {detail.insights.length === 0 ? (
          <div className="sticker-card-dashed p-5 text-sm text-muted-foreground">Aucun signal actionnable détecté sur cette période avec les données disponibles.</div>
        ) : detail.insights.map((insight) => <MetaInsightCard key={insight.id} {...insight} />)}
      </section>

      <section className="sticker-card overflow-x-auto" aria-labelledby="ads-title">
        <div className="border-b border-border px-5 py-4">
          <h2 id="ads-title" className="font-bold">Matrice créative et ensembles</h2>
          <p className="mt-1 text-xs text-muted-foreground">Les créatifs sont classés par CPL lorsque des leads existent, puis par dépense. Pour changer la créa ou le ciblage, ouvre Meta Ads.</p>
        </div>
        <table className="w-full text-sm">
          <thead>
              <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
              <th className="px-5 py-3">Rang</th>
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
                <td className="px-5 py-3 text-xs font-bold text-muted-foreground">{index + 1}</td>
                <td className="px-5 py-3 font-bold"><a href={row.deepLink} target="_blank" rel="noopener noreferrer" className="underline-offset-4 hover:underline">{row.name}</a></td>
                <td className="px-5 py-3 text-muted-foreground">Ad set</td>
                <td className="px-5 py-3 text-right tabular-nums">{metricValue(row.metrics, "spendCents") === null ? "—" : formatEur((metricValue(row.metrics, "spendCents") ?? 0) / 100)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowSpend === null || spendCents === null ? "—" : formatPercent(ratio(rowSpend, spendCents) ?? 0)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowImpressions === null || rowLinkClicks === null ? "—" : formatPercent(ratio(rowLinkClicks, rowImpressions) ?? 0)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowImpressions === null || rowReach === null ? "—" : (ratio(rowImpressions, rowReach)?.toFixed(1) ?? "—")}</td>
                <td className="px-5 py-3 text-right tabular-nums">{metricValue(row.metrics, "leads") === null ? "—" : metricValue(row.metrics, "leads")}</td>
                <td className="px-5 py-3 text-right tabular-nums">{creativeCpaCents(row) === null ? "—" : formatEur(creativeCpaCents(row)! / 100)}</td>
                <td className="px-5 py-3 text-right text-xs font-bold text-muted-foreground">{row.status ?? "—"}{rowImpressions !== null && rowReach !== null && (ratio(rowImpressions, rowReach) ?? 0) >= 3 ? " · fréquence ≥ 3×" : ""}</td>
                <td className="px-5 py-3 text-right">
                  <MetaEntityAction entityType="adset" entityId={row.id} campaignId={detail.campaign.id} status={row.status} deepLink={row.deepLink} hasWriteAccess={hasWriteAccess} accountLabel={detail.dashboard.account.name} />
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
                <td className="px-5 py-3 text-xs font-bold text-muted-foreground">{index + 1}</td>
                <td className="px-5 py-3"><a href={row.deepLink} target="_blank" rel="noopener noreferrer" className="font-bold underline-offset-4 hover:underline">{row.name}</a>{row.creativeName && <span className="ml-2 text-xs text-muted-foreground">· {row.creativeName}</span>}</td>
                <td className="px-5 py-3 text-muted-foreground">Ad</td>
                <td className="px-5 py-3 text-right tabular-nums">{metricValue(row.metrics, "spendCents") === null ? "—" : formatEur((metricValue(row.metrics, "spendCents") ?? 0) / 100)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowSpend === null || spendCents === null ? "—" : formatPercent(ratio(rowSpend, spendCents) ?? 0)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowImpressions === null || rowLinkClicks === null ? "—" : formatPercent(ratio(rowLinkClicks, rowImpressions) ?? 0)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rowImpressions === null || rowReach === null ? "—" : (ratio(rowImpressions, rowReach)?.toFixed(1) ?? "—")}</td>
                <td className="px-5 py-3 text-right tabular-nums">{metricValue(row.metrics, "leads") === null ? "—" : metricValue(row.metrics, "leads")}</td>
                <td className="px-5 py-3 text-right tabular-nums">{creativeCpaCents(row) === null ? "—" : formatEur(creativeCpaCents(row)! / 100)}</td>
                <td className="px-5 py-3 text-right text-xs font-bold text-muted-foreground">{row.status ?? "—"}{rowImpressions !== null && rowReach !== null && (ratio(rowImpressions, rowReach) ?? 0) >= 3 ? " · fréquence ≥ 3× à vérifier" : ""}</td>
                <td className="px-5 py-3 text-right">
                  <MetaEntityAction entityType="ad" entityId={row.id} campaignId={detail.campaign.id} status={row.status} deepLink={row.deepLink} hasWriteAccess={hasWriteAccess} accountLabel={detail.dashboard.account.name} />
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
