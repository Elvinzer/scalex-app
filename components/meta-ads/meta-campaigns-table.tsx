"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { setMetaCampaignProfile } from "@/app/(app)/acquisition/ads/meta-actions";
import { Button } from "@/components/ui/button";
import { formatEur } from "@/lib/currency";
import { safeRatio as ratio } from "@/lib/meta-ads/derived-metrics";
import type { MetaAdsDashboard, MetaCampaignDashboardRow, MetaMetricKey, MetaMetricTotals } from "@/lib/meta-ads/queries";
import { campaignTypeNeedsConversionGoal, META_CAMPAIGN_TYPES, META_CONVERSION_GOALS, type MetaCampaignType, type MetaConversionGoal } from "@/lib/meta-ads/types";
import { targetVarianceLabel } from "@/lib/meta-ads/targets";
import { formatPercent } from "@/lib/setting/funnel";

const numberFormatter = new Intl.NumberFormat("fr-FR");
const followerCostFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const typeLabels: Record<MetaCampaignType, string> = {
  vsl: "VSL",
  webinar: "Webinaire",
  instagram_profile_growth: "Trafic Instagram",
  retargeting: "Retargeting",
};

const conversionGoalLabels: Record<MetaConversionGoal, string> = {
  call: "Appel",
  sale: "Vente",
};

type SortKey = "default" | "name" | "type" | "spend" | "ctr" | "leads" | "costPerResult" | "roas" | "followerCost" | "status";
type SortDirection = "asc" | "desc";
type CampaignFilter = MetaCampaignType | "all" | "unassigned";

type CampaignTableMetrics = {
  campaign: MetaCampaignDashboardRow;
  spendCents: number | null;
  ctr: number | null;
  leads: number | null;
  cpl: number | null;
  roas: number | null;
  targetCpaEuros: number | null;
  targetCpaGap: string | null;
  targetRoas: number | null;
  targetRoasGap: string | null;
  followerCost: number | null;
};

function number(value: number): string {
  return numberFormatter.format(value);
}

function metricValue(metrics: MetaMetricTotals, key: MetaMetricKey): number | null {
  return metrics.available[key] ? metrics[key] : null;
}

function typeLabel(value: MetaCampaignDashboardRow["campaignType"]): string {
  return value ? typeLabels[value] : "À définir";
}

function conversionGoalLabel(value: MetaCampaignDashboardRow["conversionGoal"]): string | null {
  return value ? conversionGoalLabels[value] : null;
}

function statusLabel(status: string | null): string {
  if (!status) return "Statut inconnu";
  if (status === "ACTIVE") return "Active";
  if (status === "PAUSED") return "En pause";
  return status.toLowerCase().replaceAll("_", " ");
}

function metricProvenance(calculation: "brute" | "dérivée", available: boolean): string {
  return `Meta · ${calculation} · ${available ? "directe" : "indisponible"}`;
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

function deriveMetrics(campaign: MetaCampaignDashboardRow, instagramFollowerCount: number | null): CampaignTableMetrics {
  const impressions = metricValue(campaign.metrics, "impressions");
  const linkClicks = metricValue(campaign.metrics, "linkClicks");
  const spendCents = metricValue(campaign.metrics, "spendCents");
  const leads = metricValue(campaign.metrics, "leads");
  const ctr = impressions !== null && linkClicks !== null ? ratio(linkClicks, impressions) : null;
  const cpl = spendCents !== null && leads !== null && leads > 0 ? spendCents / leads / 100 : null;
  const purchaseValue = metricValue(campaign.metrics, "purchaseValueCents");
  const instagramGrowth = campaign.campaignType === "instagram_profile_growth";
  const roas = !instagramGrowth && purchaseValue !== null && spendCents !== null && spendCents > 0 ? purchaseValue / spendCents : null;
  const targetCpaEuros = campaign.targets?.targetCpaCents === null || campaign.targets?.targetCpaCents === undefined ? null : campaign.targets.targetCpaCents / 100;
  const targetRoas = campaign.targets?.targetRoas ?? null;
  const followerCost = instagramGrowth && instagramFollowerCount !== null && instagramFollowerCount > 0 && spendCents !== null
    ? spendCents / instagramFollowerCount / 100
    : null;

  return {
    campaign,
    spendCents,
    ctr,
    leads,
    cpl,
    roas,
    targetCpaEuros,
    targetCpaGap: targetVarianceLabel(cpl, targetCpaEuros),
    targetRoas,
    targetRoasGap: targetVarianceLabel(roas, targetRoas),
    followerCost,
  };
}

function compareNullableNumbers(a: number | null, b: number | null, direction: SortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * (direction === "asc" ? 1 : -1);
}

function compareNullableStrings(a: string | null, b: string | null, direction: SortDirection): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, "fr", { sensitivity: "base" }) * (direction === "asc" ? 1 : -1);
}

function compareDefault(a: CampaignTableMetrics, b: CampaignTableMetrics): number {
  const aDate = a.campaign.metaUpdatedAt ?? a.campaign.metaCreatedAt;
  const bDate = b.campaign.metaUpdatedAt ?? b.campaign.metaCreatedAt;
  if (aDate && bDate) {
    const dateComparison = bDate.localeCompare(aDate);
    if (dateComparison !== 0) return dateComparison;
  } else if (aDate) {
    return -1;
  } else if (bDate) {
    return 1;
  }

  const spendComparison = compareNullableNumbers(a.spendCents, b.spendCents, "desc");
  if (spendComparison !== 0) return spendComparison;
  return a.campaign.name.localeCompare(b.campaign.name, "fr", { sensitivity: "base" });
}

function compareRows(a: CampaignTableMetrics, b: CampaignTableMetrics, sortKey: SortKey, direction: SortDirection): number {
  if (sortKey === "default") return compareDefault(a, b);
  if (sortKey === "name") return a.campaign.name.localeCompare(b.campaign.name, "fr", { sensitivity: "base" }) * (direction === "asc" ? 1 : -1);
  if (sortKey === "type") return typeLabel(a.campaign.campaignType).localeCompare(typeLabel(b.campaign.campaignType), "fr", { sensitivity: "base" }) * (direction === "asc" ? 1 : -1);
  if (sortKey === "spend") return compareNullableNumbers(a.spendCents, b.spendCents, direction);
  if (sortKey === "ctr") return compareNullableNumbers(a.ctr, b.ctr, direction);
  if (sortKey === "leads") return compareNullableNumbers(a.leads, b.leads, direction);
  if (sortKey === "costPerResult") return compareNullableNumbers(a.cpl, b.cpl, direction);
  if (sortKey === "roas") return compareNullableNumbers(a.roas, b.roas, direction);
  if (sortKey === "followerCost") return compareNullableNumbers(a.followerCost, b.followerCost, direction);
  return compareNullableStrings(a.campaign.effectiveStatus ? statusLabel(a.campaign.effectiveStatus) : null, b.campaign.effectiveStatus ? statusLabel(b.campaign.effectiveStatus) : null, direction);
}

function defaultDirection(sortKey: SortKey): SortDirection {
  return sortKey === "name" || sortKey === "type" || sortKey === "status" ? "asc" : "desc";
}

function sortLabel(sortKey: SortKey): string {
  if (sortKey === "default") return "mise à jour Meta, puis dépenses";
  if (sortKey === "name") return "nom";
  if (sortKey === "type") return "type";
  if (sortKey === "spend") return "dépenses";
  if (sortKey === "ctr") return "CTR lien";
  if (sortKey === "leads") return "leads";
  if (sortKey === "costPerResult") return "CPL";
  if (sortKey === "roas") return "ROAS";
  if (sortKey === "followerCost") return "coût / follower";
  return "statut";
}

function SortHeader({
  label,
  sortKey,
  activeSortKey,
  direction,
  align = "left",
  onSort,
  testId,
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  direction: SortDirection;
  align?: "left" | "right";
  onSort: (sortKey: SortKey) => void;
  testId: string;
}) {
  const active = activeSortKey === sortKey;
  const ariaSort = active ? (direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <th scope="col" aria-sort={ariaSort} className={align === "right" ? "text-right" : "text-left"}>
      <button
        type="button"
        data-testid={testId}
        onClick={() => onSort(sortKey)}
        className={`flex min-h-11 w-full items-center gap-1 px-5 py-3 text-xs font-bold text-muted-foreground outline-none focus-visible:bg-muted focus-visible:text-foreground ${align === "right" ? "justify-end" : "justify-start"}`}
        aria-label={`Trier par ${label}${active ? `, actuellement ${direction === "asc" ? "croissant" : "décroissant"}` : ""}`}
      >
        <span>{label}</span>
        {active ? (direction === "asc" ? <ArrowUp className="size-3.5" aria-hidden="true" /> : <ArrowDown className="size-3.5" aria-hidden="true" />) : <ArrowUpDown className="size-3.5 opacity-50" aria-hidden="true" />}
      </button>
    </th>
  );
}

function CampaignTypePicker({ campaign, canManageCampaigns }: { campaign: MetaCampaignDashboardRow; canManageCampaigns: boolean }) {
  const router = useRouter();
  const initialType = campaign.campaignType ?? "";
  const initialGoal = campaign.conversionGoal ?? "";
  const [value, setValue] = useState<MetaCampaignType | "">(initialType);
  const [goal, setGoal] = useState<MetaConversionGoal | "">(initialGoal);
  const [savedValue, setSavedValue] = useState<MetaCampaignType | "">(initialType);
  const [savedGoal, setSavedGoal] = useState<MetaConversionGoal | "">(initialGoal);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedType = value === "" ? null : value;
  const needsGoal = campaignTypeNeedsConversionGoal(selectedType);
  const isComplete = value !== "" && (!needsGoal || goal !== "");
  const isDirty = value !== savedValue || goal !== savedGoal;

  if (!canManageCampaigns) {
    return (
      <div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold">{typeLabel(campaign.campaignType)}</span>
        {campaign.conversionGoal && needsGoal && <span className="mt-1 block text-xs text-muted-foreground">Objectif : {conversionGoalLabel(campaign.conversionGoal)}</span>}
      </div>
    );
  }

  function updateType(nextValue: MetaCampaignType | "") {
    setValue(nextValue);
    if (nextValue !== "vsl" && nextValue !== "webinar") setGoal("");
    setMessage(null);
    setError(null);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isComplete) return;
    setMessage(null);
    setError(null);
    startTransition(async () => {
      const nextGoal = needsGoal && goal !== "" ? goal : null;
      const result = await setMetaCampaignProfile({ campaignId: campaign.id, campaignType: value, conversionGoal: nextGoal });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSavedValue(value);
      setSavedGoal(nextGoal ?? "");
      setMessage("Enregistré");
      router.refresh();
    });
  }

  return (
    <form className="flex min-w-44 flex-col items-start gap-2" onSubmit={save} data-testid={`meta-campaign-type-form-${campaign.id}`}>
      <label className="sr-only" htmlFor={`meta-campaign-type-${campaign.id}`}>Type de la campagne {campaign.name}</label>
      <select
        id={`meta-campaign-type-${campaign.id}`}
        data-testid={`meta-campaign-type-${campaign.id}`}
        value={value}
        disabled={isPending}
        onChange={(event) => updateType(META_CAMPAIGN_TYPES.find((type) => type === event.target.value) ?? "")}
        className="h-9 w-full min-w-40 rounded-[var(--radius-control)] border border-border bg-card px-2.5 text-xs font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
      >
        <option value="" disabled={value !== ""}>Choisir un type</option>
        {META_CAMPAIGN_TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
      </select>
      {needsGoal && (
        <label className="w-full">
          <span className="sr-only">Objectif de conversion</span>
          <select
            aria-label={`Objectif de conversion pour ${campaign.name}`}
            value={goal}
            disabled={isPending}
            onChange={(event) => {
              setGoal(META_CONVERSION_GOALS.find((candidate) => candidate === event.target.value) ?? "");
              setMessage(null);
              setError(null);
            }}
            className="h-8 w-full rounded-[var(--radius-control)] border border-border bg-card px-2 text-xs outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
          >
            <option value="">Objectif…</option>
            {META_CONVERSION_GOALS.map((candidate) => <option key={candidate} value={candidate}>{conversionGoalLabels[candidate]}</option>)}
          </select>
        </label>
      )}
      {isDirty && <Button type="submit" size="sm" variant="outline" disabled={isPending || !isComplete}><Check className="size-3.5" />{isPending ? "Enregistrement…" : "Enregistrer"}</Button>}
      {error && <span className="max-w-48 text-xs font-bold text-state-critical" role="alert">{error}</span>}
      {message && <span className="text-xs font-bold text-state-healthy" role="status">{message}</span>}
    </form>
  );
}

export function MetaCampaignsTable({
  campaigns,
  periodQuery,
  canManageCampaigns,
  instagramFollowerCount,
  instagramFollowerCountUpdatedAt,
}: {
  campaigns: MetaCampaignDashboardRow[];
  periodQuery: string;
  canManageCampaigns: boolean;
  instagramFollowerCount: MetaAdsDashboard["instagramFollowerCount"];
  instagramFollowerCountUpdatedAt: MetaAdsDashboard["instagramFollowerCountUpdatedAt"];
}) {
  const [filterType, setFilterType] = useState<CampaignFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const followerCount = instagramFollowerCount ?? null;
  const rows = useMemo(() => campaigns.map((campaign) => deriveMetrics(campaign, followerCount)), [campaigns, followerCount]);
  const filteredRows = useMemo(() => {
    const visible = filterType === "all"
      ? rows
      : filterType === "unassigned"
        ? rows.filter((row) => row.campaign.campaignType === null)
        : rows.filter((row) => row.campaign.campaignType === filterType);
    return [...visible].sort((a, b) => compareRows(a, b, sortKey, sortDirection));
  }, [filterType, rows, sortDirection, sortKey]);
  const hasInstagramCampaign = campaigns.some((campaign) => campaign.campaignType === "instagram_profile_growth");
  const showFollowerCost = followerCount !== null && hasInstagramCampaign;

  function changeSort(nextSortKey: SortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc");
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection(defaultDirection(nextSortKey));
  }

  function resetSort() {
    setSortKey("default");
    setSortDirection("desc");
  }

  return (
    <>
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-bold">Campagnes Meta</p>
            <p className="mt-1 max-w-5xl text-xs text-muted-foreground">Ouvre une campagne pour voir ses détails. Le type adapte uniquement la lecture Minaly.</p>
          </div>
          <span className="text-xs font-bold text-muted-foreground" aria-live="polite">{number(filteredRows.length)} / {number(campaigns.length)} campagne(s)</span>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex min-w-52 flex-col gap-1.5 text-xs font-bold" htmlFor="meta-campaign-type-filter">
            Filtrer par type
            <select
              id="meta-campaign-type-filter"
              data-testid="meta-campaign-type-filter"
              value={filterType}
              onChange={(event) => {
                const nextValue = event.target.value;
                setFilterType(nextValue === "all" || nextValue === "unassigned" ? nextValue : META_CAMPAIGN_TYPES.find((type) => type === nextValue) ?? "all");
              }}
              className="h-9 rounded-[var(--radius-control)] border border-border bg-card px-3 text-sm font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              aria-label="Filtrer les campagnes par type"
            >
              <option value="all">Tous les types</option>
              <option value="unassigned">À définir</option>
              {META_CAMPAIGN_TYPES.map((type) => <option key={type} value={type}>{typeLabels[type]}</option>)}
            </select>
          </label>
          <div className="flex min-h-9 flex-1 flex-wrap items-center justify-between gap-2 rounded-[var(--radius-control)] bg-muted px-3 py-2 text-xs text-muted-foreground">
            <span>Tri : <strong className="text-foreground">{sortLabel(sortKey)}</strong>{sortKey !== "default" ? ` · ${sortDirection === "asc" ? "croissant" : "décroissant"}` : ""}</span>
            {sortKey !== "default" && <Button type="button" variant="ghost" size="sm" onClick={resetSort}><RotateCcw className="size-3.5" />Réinitialiser</Button>}
          </div>
        </div>
        <details className="mt-2 text-xs text-muted-foreground">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/12">À propos de la liste</summary>
          <div className="mt-1 space-y-1 border-l border-border pl-3">
            <p>Tri initial : mise à jour Meta, puis dépenses.</p>
            {hasInstagramCampaign && followerCount !== null && <p>Coût / follower : repère dérivé de {number(followerCount)} followers Instagram{instagramFollowerCountUpdatedAt ? ` relevé le ${new Intl.DateTimeFormat("fr-FR").format(new Date(instagramFollowerCountUpdatedAt))}` : ""}; non attribué individuellement.</p>}
            {hasInstagramCampaign && followerCount === null && <p className="text-state-caution">Coût / follower indisponible : nombre de followers Instagram manquant.</p>}
          </div>
        </details>
      </div>
      {campaigns.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">Aucune campagne synchronisée pour ce compte.</p>
      ) : (
        <table className={`w-full text-sm ${showFollowerCost ? "min-w-[76rem]" : "min-w-[68rem]"}`}>
          <thead>
            <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
              <SortHeader label="Campagne" sortKey="name" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} testId="meta-sort-name" />
              <SortHeader label="Type" sortKey="type" activeSortKey={sortKey} direction={sortDirection} onSort={changeSort} testId="meta-sort-type" />
              <SortHeader label="Dépenses" sortKey="spend" activeSortKey={sortKey} direction={sortDirection} align="right" onSort={changeSort} testId="meta-sort-spend" />
              <SortHeader label="CTR lien" sortKey="ctr" activeSortKey={sortKey} direction={sortDirection} align="right" onSort={changeSort} testId="meta-sort-ctr" />
              <SortHeader label="Leads" sortKey="leads" activeSortKey={sortKey} direction={sortDirection} align="right" onSort={changeSort} testId="meta-sort-leads" />
              <SortHeader label="CPL / cible" sortKey="costPerResult" activeSortKey={sortKey} direction={sortDirection} align="right" onSort={changeSort} testId="meta-sort-cpl" />
              <SortHeader label="ROAS / cible" sortKey="roas" activeSortKey={sortKey} direction={sortDirection} align="right" onSort={changeSort} testId="meta-sort-roas" />
              {showFollowerCost && <SortHeader label="Coût / follower" sortKey="followerCost" activeSortKey={sortKey} direction={sortDirection} align="right" onSort={changeSort} testId="meta-sort-follower-cost" />}
              <SortHeader label="Statut" sortKey="status" activeSortKey={sortKey} direction={sortDirection} align="right" onSort={changeSort} testId="meta-sort-status" />
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={showFollowerCost ? 9 : 8} className="px-5 py-8 text-center text-sm text-muted-foreground">Aucune campagne ne correspond à ce type.</td>
              </tr>
            ) : filteredRows.map(({ campaign, spendCents, ctr, leads, cpl, roas, targetCpaEuros, targetCpaGap, targetRoas, targetRoasGap, followerCost }) => {
              const instagramGrowth = campaign.campaignType === "instagram_profile_growth";
              return (
                <tr key={campaign.id} className="border-b border-border last:border-0">
                  <td className="sticky left-0 z-10 bg-card px-5 py-4 align-top">
                    <Link href={`/acquisition/ads/meta/${campaign.id}?${periodQuery}`} prefetch={true} className="font-bold underline-offset-4 hover:underline">{campaign.name}</Link>
                    <p className="mt-1 text-xs text-muted-foreground">{campaign.latestDate ? `Dernier jour mesuré : ${campaign.latestDate}` : "Pas encore de métrique"}</p>
                  </td>
                  <td className="px-5 py-4 align-top"><CampaignTypePicker campaign={campaign} canManageCampaigns={canManageCampaigns} /></td>
                  <td className="px-5 py-4 text-right align-top tabular-nums"><TableMetric value={spendCents === null ? "—" : formatEur(spendCents / 100)} provenance={metricProvenance("brute", spendCents !== null)} /></td>
                  <td className="px-5 py-4 text-right align-top tabular-nums"><TableMetric value={ctr === null ? "—" : formatPercent(ctr)} provenance={metricProvenance("dérivée", ctr !== null)} /></td>
                  <td className="px-5 py-4 text-right align-top tabular-nums"><TableMetric value={leads === null ? "—" : number(leads)} provenance={metricProvenance("brute", leads !== null)} /></td>
                  <td className="px-5 py-4 text-right align-top tabular-nums">
                    <TableMetric value={instagramGrowth || cpl === null ? "—" : formatEur(cpl)} provenance={metricProvenance("dérivée", !instagramGrowth && cpl !== null)} detail={instagramGrowth ? "Non applicable · campagne trafic Instagram" : undefined} />
                    {!instagramGrowth && targetCpaEuros !== null && <span className="block text-xs text-muted-foreground">cible {formatEur(targetCpaEuros)} · {targetCpaGap ?? "écart non calculable"}</span>}
                  </td>
                  <td className="px-5 py-4 text-right align-top tabular-nums">
                    <TableMetric value={instagramGrowth || roas === null ? "—" : `${roas.toFixed(2)}×`} provenance={metricProvenance("dérivée", !instagramGrowth && roas !== null)} detail={instagramGrowth ? "Non applicable · objectif profil" : undefined} />
                    {!instagramGrowth && targetRoas !== null && <span className="block text-xs text-muted-foreground">cible {targetRoas.toFixed(2)}× · {targetRoasGap ?? "écart non calculable"}</span>}
                  </td>
                  {showFollowerCost && <td className="px-5 py-4 text-right align-top tabular-nums"><TableMetric value={!instagramGrowth || followerCost === null ? "—" : followerCostFormatter.format(followerCost)} provenance={instagramGrowth && followerCost !== null ? "Meta + Instagram · dérivée · estimée" : metricProvenance("dérivée", false)} detail={!instagramGrowth ? "Non applicable" : followerCost === null ? "Dépenses Meta indisponibles" : "Repère · non attribué"} /></td>}
                  <td className="px-5 py-4 text-right align-top text-xs font-bold text-muted-foreground">{statusLabel(campaign.effectiveStatus)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
