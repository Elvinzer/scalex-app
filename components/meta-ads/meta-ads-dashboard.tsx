import { ArrowUpRight, BarChart3, Eye, MousePointerClick, Play, UserPlus } from "lucide-react";

import { MetaCampaignsTable } from "@/components/meta-ads/meta-campaigns-table";
import { MetaDataQuality } from "@/components/meta-ads/meta-data-quality";
import { MetaPeriodFilter } from "@/components/meta-ads/meta-period-filter";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import { safeRatio as ratio } from "@/lib/meta-ads/derived-metrics";
import { trendLabel } from "@/lib/meta-ads/metric-comparison";
import { DEFAULT_META_PERIOD_SELECTION, formatMetaPeriodRange, metaPeriodSelectionLabel, serializeMetaPeriodSelection, type MetaPeriodSelection } from "@/lib/meta-ads/protocol";
import { formatPercent } from "@/lib/setting/funnel";
import { metricValue, rawMetaMetricValue, type MetaAdsDashboard, type MetaCampaignDashboardRow, type MetaInstagramObservation, type MetaMetricTotals } from "@/lib/meta-ads/queries";
import { campaignTypeNeedsConversionGoal } from "@/lib/meta-ads/types";

const numberFormatter = new Intl.NumberFormat("fr-FR");

function number(value: number): string {
  return numberFormatter.format(value);
}

function metricProvenance(calculation: "brute" | "dérivée", available: boolean): string {
  return `Meta · ${calculation} · ${available ? "directe" : "indisponible"}`;
}

function Kpi({ label, value, detail, comparison, provenance, icon }: { label: string; value: string; detail: string; comparison: string; provenance: string; icon: React.ReactNode }) {
  return (
    <div className="sticker-card p-5">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-bold tracking-wide uppercase">{label}</span>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      <p className="mt-2 text-xs font-bold text-muted-foreground">{comparison}</p>
      <p className="mt-2 text-[11px] font-bold text-muted-foreground">{provenance}</p>
    </div>
  );
}

function FunnelStep({ label, value, base, tone = "accent2", unavailableReason }: { label: string; value: number | null; base: number; tone?: "accent" | "accent2"; unavailableReason?: string }) {
  const percentage = value === null ? null : ratio(value, base);
  const width = percentage === null ? 0 : Math.min(100, Math.max(3, percentage * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0 text-xs font-bold text-muted-foreground">{label}</div>
      <div className="h-2 flex-1 rounded-full bg-muted">
        {percentage !== null && <div className={`h-2 rounded-full ${tone === "accent" ? "bg-accent" : "bg-accent-2"}`} style={{ width: `${width}%` }} />}
      </div>
      <div className="w-36 shrink-0 text-right text-xs font-bold tabular-nums">
        <span>{value === null ? "—" : `${number(value)} · ${percentage === null ? "—" : formatPercent(percentage)}`}</span>
        {value === null && <span className="mt-1 block text-[10px] font-normal leading-4 text-muted-foreground">{unavailableReason ?? "Indisponible sur la période"}</span>}
      </div>
    </div>
  );
}

type FunnelTableRow = {
  label: string;
  value: number | null;
  base: number | null;
  unavailableReason?: string;
};

function FunnelTable({ rows }: { rows: FunnelTableRow[] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-[var(--radius-control)] border border-border" tabIndex={0} role="region" aria-label="Lecture tabulaire du funnel Meta Ads">
      <table className="w-full min-w-[34rem] text-xs">
        <caption className="sr-only">Lecture tabulaire du funnel</caption>
        <thead>
          <tr className="border-b border-border text-left font-bold text-muted-foreground">
            <th className="sticky left-0 z-10 bg-card px-3 py-2">Étape</th>
            <th className="px-3 py-2 text-right">Valeur</th>
            <th className="px-3 py-2 text-right">Taux vs étape précédente</th>
            <th className="px-3 py-2">Disponibilité</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rate = ratio(row.value, row.base);
            return (
              <tr key={row.label} className="border-b border-border last:border-0">
                <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-bold">{row.label}</th>
                <td className="px-3 py-2 text-right tabular-nums">{row.value === null ? "—" : number(row.value)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{rate === null ? "—" : formatPercent(rate)}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.unavailableReason ?? (row.value === null ? "Indisponible sur la période" : "Mesurée")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FunnelCard({ totals, campaignType, instagramObservation, frequencySaturationThreshold }: { totals: MetaMetricTotals; campaignType: MetaCampaignDashboardRow["campaignType"]; instagramObservation: MetaInstagramObservation; frequencySaturationThreshold: number }) {
  const impressions = metricValue(totals, "impressions");
  const linkClicks = metricValue(totals, "linkClicks");
  const video3sViews = metricValue(totals, "video3sViews");
  const videoThruplay = metricValue(totals, "videoThruplay");
  const leads = metricValue(totals, "leads");
  const registrations = metricValue(totals, "registrations");
  const profileVisits = metricValue(totals, "profileVisits");
  const observedFollows = instagramObservation.current.follows;
  const spendCents = metricValue(totals, "spendCents");
  if (campaignType === null) {
    return (
      <div className="sticker-card-dashed p-6">
        <p className="font-bold">Funnel en attente de configuration</p>
        <p className="mt-1 text-sm text-muted-foreground">Le funnel global n&apos;est pas synthétisé lorsque le compte mélange plusieurs types. Ouvre une campagne pour lire son funnel ; si une campagne est « À définir », configure-la d&apos;abord.</p>
      </div>
    );
  }
  if (campaignType === "vsl") {
    return (
      <div className="sticker-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">Parcours VSL</p>
            <p className="mt-1 text-sm text-muted-foreground">Les étapes qui permettent de distinguer le problème d&apos;accroche du problème d&apos;offre.</p>
          </div>
          <Play className="size-5 text-accent-2" />
        </div>
        <div className="mt-5 space-y-3">
          <FunnelStep label="Impressions" value={impressions} base={impressions ?? 0} tone="accent" />
          <FunnelStep label="Vues 3 sec." value={video3sViews} base={impressions ?? 0} unavailableReason="Source vidéo Meta indisponible sur la période" />
          <FunnelStep label="ThruPlay" value={videoThruplay} base={video3sViews ?? 0} unavailableReason="Source vidéo Meta indisponible sur la période" />
          <FunnelStep label="Leads" value={leads} base={videoThruplay ?? impressions ?? 0} tone="accent" unavailableReason="Leads Meta indisponibles sur la période" />
          <p className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-xs text-state-caution">Lecture VSL et watch depth : indisponibles · source manquante : événements de lecture de la page VSL.</p>
          <FunnelTable rows={[
            { label: "Impressions", value: impressions, base: impressions },
            { label: "Vues 3 sec.", value: video3sViews, base: impressions },
            { label: "ThruPlay", value: videoThruplay, base: video3sViews },
            { label: "Lecture VSL", value: null, base: null, unavailableReason: "Source manquante : événements de lecture de la page VSL" },
            { label: "Watch depth", value: null, base: null, unavailableReason: "Source manquante : événements de progression de la page VSL" },
            { label: "Leads", value: leads, base: videoThruplay ?? impressions },
          ]} />
          <p className="text-[11px] text-muted-foreground">Provenance : compteurs Meta · brute · directe ; taux de funnel · Meta · dérivée · directe. Les événements de lecture VSL restent non connectés.</p>
        </div>
      </div>
    );
  }
  if (campaignType === "webinar") {
    return (
      <div className="sticker-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">Parcours webinaire</p>
            <p className="mt-1 text-sm text-muted-foreground">Inscription, présence et conversion : les données aval restent affichées comme indisponibles tant qu&apos;elles ne sont pas reliées.</p>
          </div>
          <Eye className="size-5 text-accent-2" />
        </div>
        <div className="mt-5 space-y-3">
          <FunnelStep label="Clics" value={linkClicks} base={impressions ?? 0} tone="accent" />
          <FunnelStep label="Inscriptions" value={registrations} base={linkClicks ?? 0} unavailableReason="Inscriptions Meta indisponibles sur la période" />
          <FunnelStep label="Présents" value={null} base={registrations ?? 0} unavailableReason="Source manquante : événement de présence du webinar" />
          <FunnelStep label="Ventes Meta" value={metricValue(totals, "purchases")} base={registrations ?? 0} tone="accent" unavailableReason="Achats Meta indisponibles sur la période" />
          <p className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-3 py-2 text-xs text-state-caution">Présence live et présence jusqu&apos;au pitch : indisponibles · source manquante : événement du webinar.</p>
          <FunnelTable rows={[
            { label: "Clics", value: linkClicks, base: impressions },
            { label: "Inscriptions", value: registrations, base: linkClicks },
            { label: "Présence live", value: null, base: registrations, unavailableReason: "Source manquante : événement de présence du webinar" },
            { label: "Présence jusqu'au pitch", value: null, base: registrations, unavailableReason: "Source manquante : événement de progression du webinar" },
            { label: "Ventes Meta", value: metricValue(totals, "purchases"), base: registrations },
          ]} />
          <p className="text-[11px] text-muted-foreground">Provenance : compteurs Meta · brute · directe ; taux de funnel · Meta · dérivée · directe. Présence live et pitch restent indisponibles sans source webinar.</p>
        </div>
      </div>
    );
  }
  if (campaignType === "instagram_profile_growth") {
    return (
      <div className="sticker-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">Parcours profil Instagram</p>
            <p className="mt-1 text-sm text-muted-foreground">On sépare les visites générées par la pub des abonnements effectivement mesurés.</p>
          </div>
          <UserPlus className="size-5 text-accent-2" />
        </div>
        <div className="mt-5 space-y-3">
          <FunnelStep label="Impressions" value={impressions} base={impressions ?? 0} tone="accent" />
          <FunnelStep label="Visites profil" value={profileVisits} base={impressions ?? 0} unavailableReason="Visites de profil Meta indisponibles sur la période" />
          <FunnelStep label="Abonnements observés" value={observedFollows} base={profileVisits ?? 0} tone="accent" unavailableReason={instagramObservation.connected ? "Observation Instagram indisponible sur la période" : "Source manquante : connexion Instagram"} />
          <p className="text-xs text-muted-foreground">
            Coût / follower observé : {spendCents !== null && observedFollows !== null && observedFollows > 0 ? formatEur(spendCents / observedFollows / 100) : "—"} · Meta + Instagram · dérivée · estimée. {instagramObservation.connected ? "Les follows sont observés sur la période, pas directement attribués à la publicité." : "Étape indisponible · connecte Instagram pour observer les follows."}
          </p>
          <FunnelTable rows={[
            { label: "Impressions", value: impressions, base: impressions },
            { label: "Visites profil", value: profileVisits, base: impressions },
            { label: "Abonnements observés", value: observedFollows, base: profileVisits, unavailableReason: instagramObservation.connected ? undefined : "Source manquante : connexion Instagram" },
          ]} />
          <p className="text-[11px] text-muted-foreground">Provenance : impressions et visites · Meta · brute · directe ; abonnements observés · Instagram · brute · non attribuée ; coût/follower · Meta + Instagram · dérivée · estimée.</p>
        </div>
      </div>
    );
  }
  if (campaignType === "retargeting") {
    const frequency = ratio(impressions, metricValue(totals, "reach"));
    const ctr = ratio(linkClicks, impressions);
    const leads = metricValue(totals, "leads");
    return (
      <div className="sticker-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-bold">Parcours retargeting</p>
            <p className="mt-1 text-sm text-muted-foreground">Fréquence, réponse et coût : les audiences et exclusions se vérifient dans Meta Ads.</p>
          </div>
          <MousePointerClick className="size-5 text-accent-2" />
        </div>
        <div className="mt-5 space-y-3">
          <FunnelStep label="Impressions" value={impressions} base={impressions ?? 0} tone="accent" />
          <FunnelStep label="Clics lien" value={linkClicks} base={impressions ?? 0} unavailableReason="Clics lien Meta indisponibles sur la période" />
          <FunnelStep label="Leads" value={leads} base={linkClicks ?? 0} tone="accent" unavailableReason="Leads Meta indisponibles sur la période" />
          <p className="rounded-[var(--radius-control)] border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            Fréquence directionnelle : {frequency === null ? "—" : frequency.toFixed(1)} · seuil de saturation : {frequencySaturationThreshold}×. {frequency !== null && frequency > frequencySaturationThreshold ? "Signal de saturation à vérifier dans Meta Ads." : "Aucun franchissement du seuil sur cette lecture."} Le reach additionné par jour n&apos;est pas dédupliqué.
          </p>
          <p className="text-xs text-muted-foreground">Segments, chevauchements et exclusions : indisponibles depuis cette lecture d&apos;Insights ; ouvre Meta Ads pour les vérifier.</p>
          <p className="text-xs font-bold text-muted-foreground">CTR actuel : {ctr === null ? "—" : formatPercent(ctr)} · source Meta · dérivée · directe</p>
          <FunnelTable rows={[
            { label: "Impressions", value: impressions, base: impressions },
            { label: "Clics lien", value: linkClicks, base: impressions },
            { label: "Leads", value: leads, base: linkClicks },
          ]} />
          <p className="text-[11px] text-muted-foreground">Provenance : compteurs Meta · brute · directe ; CTR et fréquence · Meta · dérivée · directe. La fréquence repose sur un reach additionné par jour.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="sticker-card p-6">
      <p className="font-bold">Lecture de la campagne</p>
      <p className="mt-1 text-sm text-muted-foreground">Choisis un type VSL, Webinaire, Profil Instagram ou Retargeting pour débloquer les étapes adaptées dans les insights.</p>
      <div className="mt-5 space-y-3">
        <FunnelStep label="Impressions" value={impressions} base={impressions ?? 0} tone="accent" />
        <FunnelStep label="Clics" value={linkClicks} base={impressions ?? 0} unavailableReason="Clics Meta indisponibles sur la période" />
        <FunnelStep label="Leads" value={leads} base={linkClicks ?? 0} tone="accent" unavailableReason="Leads Meta indisponibles sur la période" />
        <FunnelTable rows={[
          { label: "Impressions", value: impressions, base: impressions },
          { label: "Clics", value: linkClicks, base: impressions },
          { label: "Leads", value: leads, base: linkClicks },
        ]} />
        <p className="text-[11px] text-muted-foreground">Provenance : compteurs Meta · brute · directe ; taux de funnel · Meta · dérivée · directe.</p>
      </div>
    </div>
  );
}

export function MetaAdsDashboard({ data, canManageCampaigns = false, periodSelection = DEFAULT_META_PERIOD_SELECTION }: { data: MetaAdsDashboard; canManageCampaigns?: boolean; periodSelection?: MetaPeriodSelection }) {
  const spendCents = metricValue(data.totals, "spendCents");
  const comparisonSpendCents = metricValue(data.comparisonTotals, "spendCents");
  const impressions = metricValue(data.totals, "impressions");
  const comparisonImpressions = metricValue(data.comparisonTotals, "impressions");
  const linkClicks = metricValue(data.totals, "linkClicks");
  const comparisonLinkClicks = metricValue(data.comparisonTotals, "linkClicks");
  const leads = metricValue(data.totals, "leads");
  const comparisonLeads = metricValue(data.comparisonTotals, "leads");
  const rawCtr = rawMetaMetricValue(data.totals, "ctr");
  const rawComparisonCtr = rawMetaMetricValue(data.comparisonTotals, "ctr");
  const ctr = rawCtr ?? (impressions !== null && linkClicks !== null ? ratio(linkClicks, impressions) : null);
  const comparisonCtr = rawComparisonCtr ?? (comparisonImpressions !== null && comparisonLinkClicks !== null ? ratio(comparisonLinkClicks, comparisonImpressions) : null);
  const rawCpcCents = rawMetaMetricValue(data.totals, "cpcCents");
  const rawComparisonCpcCents = rawMetaMetricValue(data.comparisonTotals, "cpcCents");
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
  const rawCpmCents = rawMetaMetricValue(data.totals, "cpmCents");
  const rawComparisonCpmCents = rawMetaMetricValue(data.comparisonTotals, "cpmCents");
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
  const campaignTypes = [...new Set(data.campaigns.map((campaign) => campaign.campaignType).filter((type): type is NonNullable<typeof type> => type !== null))];
  const allCampaignsConfigured = data.campaigns.length > 0 && data.campaigns.every((campaign) => campaign.campaignType !== null && (!campaignTypeNeedsConversionGoal(campaign.campaignType) || campaign.conversionGoal !== null));
  const primaryType = allCampaignsConfigured && campaignTypes.length === 1 ? campaignTypes[0]! : null;
  const coverageValues = data.campaigns.map((campaign) => campaign.metricCoverageRate).filter((value): value is number => value !== null && value !== undefined);
  const minimumCoverage = coverageValues.length > 0 ? Math.min(...coverageValues) : null;
  const periodQuery = serializeMetaPeriodSelection(periodSelection);
  const cplTargetCount = data.campaigns.filter((campaign) => campaign.campaignType !== "instagram_profile_growth" && campaign.targets?.targetCpaCents !== null && campaign.targets?.targetCpaCents !== undefined).length;
  const cplApplicable = primaryType !== "instagram_profile_growth";
  const cplDetail = primaryType === "instagram_profile_growth"
    ? "Non applicable pour une campagne de croissance Instagram · voir coût / follower observé"
    : leads === null
      ? "Leads Meta indisponibles sur la période"
      : leads === 0
        ? "Aucun lead mesuré sur la période"
        : spendCents === null
          ? `${number(leads)} lead(s) · dépenses Meta indisponibles`
          : `${number(leads)} lead(s) mesuré(s)`;

  return (
    <section className="flex flex-col gap-5" aria-labelledby="meta-ads-dashboard-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-accent-2 uppercase">Meta Ads · {data.account.name}</p>
          <h2 id="meta-ads-dashboard-title" className="mt-1 text-xl font-bold">Performance</h2>
          <p className="mt-1 text-sm text-muted-foreground">{metaPeriodSelectionLabel(periodSelection)} · {formatMetaPeriodRange(data.period)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <MetaPeriodFilter selection={periodSelection} period={data.period} />
          <Button variant="outline" asChild>
            <a href="/integrations#meta-ads">Connexion <ArrowUpRight className="size-4" /></a>
          </Button>
        </div>
      </div>
      <MetaDataQuality
        coverageRate={minimumCoverage}
        missingDates={data.missingMetricDates}
        consolidatedThrough={data.period.consolidatedThrough}
        initialSyncStatus={data.connection.initialSyncStatus}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Dépenses" value={spendCents === null ? "—" : formatEur(spendCents / 100)} detail={`${impressions === null ? "—" : number(impressions)} impressions`} comparison={trendLabel(spendCents, comparisonSpendCents)} provenance={metricProvenance("brute", spendCents !== null)} icon={<Eye className="size-4" />} />
        <Kpi label="CTR lien" value={ctr === null ? "—" : formatPercent(ctr)} detail={`${linkClicks === null ? "—" : number(linkClicks)} clics lien`} comparison={trendLabel(ctr, comparisonCtr)} provenance={metricProvenance(rawCtr !== null ? "brute" : "dérivée", ctr !== null)} icon={<MousePointerClick className="size-4" />} />
        <Kpi label="CPC lien" value={cpc === null ? "—" : formatEur(cpc)} detail="Coût par clic sortant" comparison={trendLabel(cpc, comparisonCpc)} provenance={metricProvenance(rawCpcCents !== null ? "brute" : "dérivée", cpc !== null)} icon={<MousePointerClick className="size-4" />} />
        <Kpi label="Coût / lead" value={!cplApplicable || cpl === null ? "—" : formatEur(cpl)} detail={[cplDetail, cplTargetCount > 0 ? `${number(cplTargetCount)} cible(s) par campagne` : null].filter(Boolean).join(" · ")} comparison={cplApplicable ? trendLabel(cpl, comparisonCpl) : "Non applicable"} provenance={metricProvenance("dérivée", cplApplicable && cpl !== null)} icon={<UserPlus className="size-4" />} />
        <Kpi label="CPM" value={cpm === null ? "—" : formatEur(cpm)} detail="Coût pour 1 000 impressions" comparison={trendLabel(cpm, comparisonCpm)} provenance={metricProvenance(rawCpmCents !== null ? "brute" : "dérivée", cpm !== null)} icon={<BarChart3 className="size-4" />} />
      </div>

      <FunnelCard totals={data.totals} campaignType={primaryType} instagramObservation={data.instagramObservation} frequencySaturationThreshold={data.frequencySaturationThreshold} />

      <div className="sticker-card overflow-x-auto" tabIndex={0} role="region" aria-label="Tableau des campagnes Meta">
        <MetaCampaignsTable
          campaigns={data.campaigns}
          periodQuery={periodQuery}
          canManageCampaigns={canManageCampaigns}
          instagramFollowerCount={data.instagramFollowerCount}
          instagramFollowerCountUpdatedAt={data.instagramFollowerCountUpdatedAt}
        />
      </div>
    </section>
  );
}
