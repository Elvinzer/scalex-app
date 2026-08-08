import { ArrowUpRight, BarChart3, Eye, MousePointerClick, Play, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import { trendLabel } from "@/lib/meta-ads/metric-comparison";
import { META_PERIOD_OPTIONS } from "@/lib/meta-ads/protocol";
import { formatPercent } from "@/lib/setting/funnel";
import { metricValue, type MetaAdsDashboard, type MetaCampaignDashboardRow, type MetaInstagramObservation, type MetaMetricTotals } from "@/lib/meta-ads/queries";
import { targetVarianceLabel } from "@/lib/meta-ads/targets";

const numberFormatter = new Intl.NumberFormat("fr-FR");

function number(value: number): string {
  return numberFormatter.format(value);
}

function metricProvenance(calculation: "brute" | "dérivée", available: boolean): string {
  return `Meta · ${calculation} · ${available ? "directe" : "indisponible"}`;
}

const CORRECTION_FIELDS = [
  ["spendCents", "Dépenses"],
  ["impressions", "Impressions"],
  ["linkClicks", "Clics lien"],
  ["leads", "Leads"],
  ["purchases", "Achats"],
  ["purchaseValueCents", "Valeur achats"],
] as const;

function correctionValue(value: unknown, field: string): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return field === "spendCents" || field === "purchaseValueCents" ? formatEur(value / 100) : number(Math.round(value));
}

function correctionSummary(snapshot: Record<string, unknown>): string {
  return CORRECTION_FIELDS
    .flatMap(([field, label]) => {
      const value = snapshot[field];
      return typeof value === "number" && Number.isFinite(value) ? [`${label} ${correctionValue(value, field)}`] : [];
    })
    .join(" · ") || "Valeurs détaillées indisponibles";
}

function ratio(numerator: number | null, denominator: number | null): number | null {
  return numerator !== null && denominator !== null && denominator > 0 ? numerator / denominator : null;
}

function typeLabel(value: MetaCampaignDashboardRow["campaignType"]): string {
  if (value === "vsl") return "VSL";
  if (value === "webinar") return "Webinaire";
  if (value === "instagram_profile_growth") return "Followers Instagram";
  if (value === "retargeting") return "Retargeting";
  return "Autre";
}

function statusLabel(status: string | null): string {
  if (!status) return "Statut inconnu";
  if (status === "ACTIVE") return "Active";
  if (status === "PAUSED") return "En pause";
  return status.toLowerCase().replaceAll("_", " ");
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

function FunnelStep({ label, value, base, tone = "accent2" }: { label: string; value: number | null; base: number; tone?: "accent" | "accent2" }) {
  const percentage = value === null ? null : ratio(value, base);
  const width = percentage === null ? 0 : Math.min(100, Math.max(3, percentage * 100));
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 shrink-0 text-xs font-bold text-muted-foreground">{label}</div>
      <div className="h-2 flex-1 rounded-full bg-muted">
        {percentage !== null && <div className={`h-2 rounded-full ${tone === "accent" ? "bg-accent" : "bg-accent-2"}`} style={{ width: `${width}%` }} />}
      </div>
      <div className="w-20 text-right text-xs font-bold tabular-nums">
        {value === null ? "—" : `${number(value)} · ${percentage === null ? "—" : formatPercent(percentage)}`}
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
          <FunnelStep label="Vues 3 sec." value={video3sViews} base={impressions ?? 0} />
          <FunnelStep label="ThruPlay" value={videoThruplay} base={video3sViews ?? 0} />
          <FunnelStep label="Leads" value={leads} base={videoThruplay ?? impressions ?? 0} tone="accent" />
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
          <FunnelStep label="Inscriptions" value={registrations} base={linkClicks ?? 0} />
          <FunnelStep label="Présents" value={null} base={registrations ?? 0} />
          <FunnelStep label="Ventes Meta" value={metricValue(totals, "purchases")} base={registrations ?? 0} tone="accent" />
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
          <FunnelStep label="Visites profil" value={profileVisits} base={impressions ?? 0} />
          <FunnelStep label="Abonnements observés" value={observedFollows} base={profileVisits ?? 0} tone="accent" />
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
          <FunnelStep label="Clics lien" value={linkClicks} base={impressions ?? 0} />
          <FunnelStep label="Leads" value={leads} base={linkClicks ?? 0} tone="accent" />
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
        <FunnelStep label="Clics" value={linkClicks} base={impressions ?? 0} />
        <FunnelStep label="Leads" value={leads} base={linkClicks ?? 0} tone="accent" />
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

export function MetaAdsDashboard({ data }: { data: MetaAdsDashboard }) {
  const spendCents = metricValue(data.totals, "spendCents");
  const comparisonSpendCents = metricValue(data.comparisonTotals, "spendCents");
  const impressions = metricValue(data.totals, "impressions");
  const comparisonImpressions = metricValue(data.comparisonTotals, "impressions");
  const linkClicks = metricValue(data.totals, "linkClicks");
  const comparisonLinkClicks = metricValue(data.comparisonTotals, "linkClicks");
  const leads = metricValue(data.totals, "leads");
  const comparisonLeads = metricValue(data.comparisonTotals, "leads");
  const ctr = impressions !== null && linkClicks !== null ? ratio(linkClicks, impressions) : null;
  const comparisonCtr = comparisonImpressions !== null && comparisonLinkClicks !== null ? ratio(comparisonLinkClicks, comparisonImpressions) : null;
  const cpc = linkClicks !== null && linkClicks > 0 && spendCents !== null ? spendCents / linkClicks / 100 : null;
  const comparisonCpc = comparisonLinkClicks !== null && comparisonLinkClicks > 0 && comparisonSpendCents !== null ? comparisonSpendCents / comparisonLinkClicks / 100 : null;
  const cpl = leads !== null && leads > 0 && spendCents !== null ? spendCents / leads / 100 : null;
  const comparisonCpl = comparisonLeads !== null && comparisonLeads > 0 && comparisonSpendCents !== null ? comparisonSpendCents / comparisonLeads / 100 : null;
  const cpm = impressions !== null && impressions > 0 && spendCents !== null ? (spendCents / impressions) * 1000 / 100 : null;
  const comparisonCpm = comparisonImpressions !== null && comparisonImpressions > 0 && comparisonSpendCents !== null ? (comparisonSpendCents / comparisonImpressions) * 1000 / 100 : null;
  const campaignTypes = [...new Set(data.campaigns.map((campaign) => campaign.campaignType).filter((type) => type !== "other"))];
  const primaryType = campaignTypes.length === 1 ? campaignTypes[0]! : "other";
  const coverageValues = data.campaigns.map((campaign) => campaign.metricCoverageRate).filter((value): value is number => value !== null && value !== undefined);
  const minimumCoverage = coverageValues.length > 0 ? Math.min(...coverageValues) : null;
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
          <p className="text-xs font-bold tracking-wide text-accent-2 uppercase">Source Meta Ads · {data.account.name}</p>
          <h2 id="meta-ads-dashboard-title" className="mt-1 text-xl font-bold">Performance des {data.period.days} derniers jours</h2>
          <p className="mt-1 text-sm text-muted-foreground">{data.period.start} → {data.period.end} · chiffres issus des Insights Meta, actualisés automatiquement.</p>
          <p className="mt-1 text-xs text-muted-foreground">Comparaison : {data.comparisonPeriod.start} → {data.comparisonPeriod.end} · même durée précédente.</p>
          <p className="mt-2 text-xs font-bold text-muted-foreground">
            {data.period.consolidatedThrough
              ? `Chiffres définitifs jusqu’au ${new Intl.DateTimeFormat("fr-FR").format(new Date(`${data.period.consolidatedThrough}T12:00:00Z`))} · les jours suivants peuvent évoluer.`
              : "Fenêtre de consolidation en cours · les chiffres récents peuvent évoluer."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Couverture minimale des campagnes : {minimumCoverage === null ? "—" : formatPercent(minimumCoverage)} · les périodes incomplètes ne sont pas complétées par des zéros.
          </p>
          {data.missingMetricDates.length > 0 && (
            <p className="mt-1 text-xs font-bold text-state-caution" role="status">
              Jours sans série Meta synchronisée : {data.missingMetricDates.slice(0, 8).join(", ")}{data.missingMetricDates.length > 8 ? ` · +${data.missingMetricDates.length - 8} autre(s)` : ""}. Ces dates restent indisponibles.
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex items-center gap-1 rounded-[var(--radius-control)] border border-border bg-card p-1" aria-label="Période Meta Ads">
            {META_PERIOD_OPTIONS.map((days) => (
              <a key={days} href={`/acquisition/ads?meta_days=${days}`} aria-current={data.period.days === days ? "page" : undefined} className={`rounded-[var(--radius-control)] px-3 py-1.5 text-xs font-bold ${data.period.days === days ? "bg-accent-2-soft text-accent-2-text" : "text-muted-foreground hover:bg-muted"}`}>
                {days} j
              </a>
            ))}
          </nav>
          <Button variant="outline" asChild>
            <a href="/integrations#meta-ads">Gérer la connexion <ArrowUpRight className="size-4" /></a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Dépenses" value={spendCents === null ? "—" : formatEur(spendCents / 100)} detail={`${impressions === null ? "—" : number(impressions)} impressions`} comparison={trendLabel(spendCents, comparisonSpendCents)} provenance={metricProvenance("brute", spendCents !== null)} icon={<Eye className="size-4" />} />
        <Kpi label="CTR lien" value={ctr === null ? "—" : formatPercent(ctr)} detail={`${linkClicks === null ? "—" : number(linkClicks)} clics lien`} comparison={trendLabel(ctr, comparisonCtr)} provenance={metricProvenance("dérivée", ctr !== null)} icon={<MousePointerClick className="size-4" />} />
        <Kpi label="CPC lien" value={cpc === null ? "—" : formatEur(cpc)} detail="Coût par clic sortant" comparison={trendLabel(cpc, comparisonCpc)} provenance={metricProvenance("dérivée", cpc !== null)} icon={<MousePointerClick className="size-4" />} />
        <Kpi label="Coût / lead" value={!cplApplicable || cpl === null ? "—" : formatEur(cpl)} detail={[cplDetail, cplTargetCount > 0 ? `${number(cplTargetCount)} cible(s) par campagne` : null].filter(Boolean).join(" · ")} comparison={cplApplicable ? trendLabel(cpl, comparisonCpl) : "Non applicable"} provenance={metricProvenance("dérivée", cplApplicable && cpl !== null)} icon={<UserPlus className="size-4" />} />
        <Kpi label="CPM" value={cpm === null ? "—" : formatEur(cpm)} detail="Coût pour 1 000 impressions" comparison={trendLabel(cpm, comparisonCpm)} provenance={metricProvenance("dérivée", cpm !== null)} icon={<BarChart3 className="size-4" />} />
      </div>

      {data.connection.initialSyncStatus !== "completed" && (
        <div className="rounded-[var(--radius-control)] border border-state-caution/40 bg-state-caution/10 px-4 py-3 text-sm text-state-caution">
          Les données Meta sont encore en préparation ({data.connection.initialSyncStatus}). Les métriques affichées peuvent être partielles.
        </div>
      )}

      <FunnelCard totals={data.totals} campaignType={primaryType} instagramObservation={data.instagramObservation} frequencySaturationThreshold={data.frequencySaturationThreshold} />

      {data.corrections.length > 0 && (
        <section className="sticker-card overflow-x-auto" aria-labelledby="meta-corrections-title" tabIndex={0} role="region">
          <div className="border-b border-border px-5 py-4">
            <h2 id="meta-corrections-title" className="font-bold">Corrections rétroactives Meta</h2>
            <p className="mt-1 text-xs text-muted-foreground">Meta a révisé des journées déjà consolidées. Les valeurs avant/après restent visibles pour éviter toute modification silencieuse.</p>
          </div>
          <table className="w-full min-w-[48rem] text-xs">
            <thead>
              <tr className="border-b border-border text-left font-bold text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card px-5 py-3">Journée</th>
                <th className="px-5 py-3">Niveau</th>
                <th className="px-5 py-3">Avant</th>
                <th className="px-5 py-3">Après</th>
                <th className="px-5 py-3">Motif</th>
              </tr>
            </thead>
            <tbody>
              {data.corrections.map((correction) => (
                <tr key={correction.id} className="border-b border-border last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-5 py-3 font-bold">{correction.date}</td>
                  <td className="px-5 py-3 uppercase">{correction.level}</td>
                  <td className="px-5 py-3">{correctionSummary(correction.beforeSnapshot)}</td>
                  <td className="px-5 py-3">{correctionSummary(correction.afterSnapshot)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{correction.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="sticker-card overflow-x-auto" tabIndex={0} role="region" aria-label="Tableau des campagnes Meta">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="font-bold">Campagnes Meta</p>
            <p className="mt-1 text-xs text-muted-foreground">Clique une campagne pour lire ses créas, son funnel et ses insights. Dépenses, impressions et leads · Meta · brute · directe ; CTR · Meta · dérivée · directe.</p>
          </div>
          <span className="text-xs font-bold text-muted-foreground">{number(data.campaigns.length)} campagne(s)</span>
        </div>
        {data.campaigns.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">Aucune campagne synchronisée pour ce compte.</p>
        ) : (
          <table className="w-full min-w-[64rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
                <th className="sticky left-0 z-10 bg-card px-5 py-3">Campagne</th>
                <th className="px-5 py-3">Type</th>
                <th className="px-5 py-3 text-right">Dépenses</th>
                <th className="px-5 py-3 text-right">CTR lien</th>
                <th className="px-5 py-3 text-right">Leads</th>
                <th className="px-5 py-3 text-right">CPL / cible</th>
                <th className="px-5 py-3 text-right">ROAS / cible</th>
                <th className="px-5 py-3 text-right">Statut</th>
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((campaign) => {
                const campaignImpressions = metricValue(campaign.metrics, "impressions");
                const campaignLinkClicks = metricValue(campaign.metrics, "linkClicks");
                const campaignCtr = campaignImpressions !== null && campaignLinkClicks !== null ? ratio(campaignLinkClicks, campaignImpressions) : null;
                const campaignSpend = metricValue(campaign.metrics, "spendCents");
                const campaignLeads = metricValue(campaign.metrics, "leads");
                const campaignCpl = campaignSpend !== null && campaignLeads !== null && campaignLeads > 0 ? campaignSpend / campaignLeads / 100 : null;
                const campaignPurchaseValue = metricValue(campaign.metrics, "purchaseValueCents");
                const instagramGrowth = campaign.campaignType === "instagram_profile_growth";
                const campaignRoas = !instagramGrowth && campaignPurchaseValue !== null && campaignSpend !== null && campaignSpend > 0 ? campaignPurchaseValue / campaignSpend : null;
                const targetCpaEuros = campaign.targets?.targetCpaCents === null || campaign.targets?.targetCpaCents === undefined ? null : campaign.targets.targetCpaCents / 100;
                const targetCpaGap = targetVarianceLabel(campaignCpl, targetCpaEuros);
                const targetRoas = campaign.targets?.targetRoas ?? null;
                const targetRoasGap = targetVarianceLabel(campaignRoas, targetRoas);
                return (
                  <tr key={campaign.id} className="border-b border-border last:border-0">
                    <td className="sticky left-0 z-10 bg-card px-5 py-4">
                        <a href={`/acquisition/ads/meta/${campaign.id}?meta_days=${data.period.days}`} className="font-bold underline-offset-4 hover:underline">
                        {campaign.name}
                      </a>
                      <p className="mt-1 text-xs text-muted-foreground">{campaign.latestDate ? `Dernier jour : ${campaign.latestDate}` : "Pas encore de métrique"}</p>
                    </td>
                    <td className="px-5 py-4">
                      <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{typeLabel(campaign.campaignType)}</span>
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">{metricValue(campaign.metrics, "spendCents") === null ? "—" : formatEur((metricValue(campaign.metrics, "spendCents") ?? 0) / 100)}</td>
                    <td className="px-5 py-4 text-right tabular-nums">{campaignCtr === null ? "—" : formatPercent(campaignCtr)}</td>
                    <td className="px-5 py-4 text-right tabular-nums">{metricValue(campaign.metrics, "leads") === null ? "—" : number(metricValue(campaign.metrics, "leads") ?? 0)}</td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {instagramGrowth || campaignCpl === null ? "—" : formatEur(campaignCpl)}
                      {instagramGrowth && <span className="block text-xs text-muted-foreground">non applicable · coût / follower observé</span>}
                      {!instagramGrowth && targetCpaEuros !== null && <span className="block text-xs text-muted-foreground">cible {formatEur(targetCpaEuros)} · {targetCpaGap ?? "écart non calculable"}</span>}
                    </td>
                    <td className="px-5 py-4 text-right tabular-nums">
                      {instagramGrowth ? "—" : campaignRoas === null ? "—" : `${campaignRoas.toFixed(2)}×`}
                      {instagramGrowth && <span className="block text-xs text-muted-foreground">non applicable · objectif profil</span>}
                      {!instagramGrowth && targetRoas !== null && <span className="block text-xs text-muted-foreground">cible {targetRoas.toFixed(2)}× · {targetRoasGap ?? "écart non calculable"}</span>}
                    </td>
                    <td className="px-5 py-4 text-right text-xs font-bold text-muted-foreground">{statusLabel(campaign.effectiveStatus)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
