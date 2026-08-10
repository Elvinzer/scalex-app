import type { MetaAttributionSettings, MetaEntityLevel } from "./types";

// Keep the fallback on the currently supported version. Deployments may
// override it explicitly when Meta releases a newer version.
export const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION ?? "v25.0";
export const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;
export const META_AUTHORIZE_URL = `https://www.facebook.com/${META_GRAPH_API_VERSION}/dialog/oauth`;

export const META_READ_SCOPES = ["ads_read"] as const;
export const META_WRITE_SCOPES = ["ads_read", "ads_management"] as const;

// Keep this list centralized. If Meta removes or renames a field, the client
// can degrade to the smaller fallback list without changing every sync job.
export const META_CAMPAIGN_FIELDS = [
  "id",
  "name",
  "objective",
  "optimization_goal",
  "status",
  "effective_status",
  "created_time",
  "updated_time",
  "daily_budget",
  "lifetime_budget",
  "start_time",
  "stop_time",
  "promoted_object",
] as const;

export const META_AD_SET_FIELDS = [
  "id",
  "campaign_id",
  "name",
  "status",
  "effective_status",
  "targeting",
  "daily_budget",
  "lifetime_budget",
] as const;

export const META_AD_FIELDS = [
  "id",
  "adset_id",
  "campaign_id",
  "name",
  "status",
  "effective_status",
  "creative{id,name,thumbnail_url,object_story_spec}",
] as const;

export const META_INSIGHT_FIELDS = [
  "account_id",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "date_start",
  "date_stop",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "inline_link_clicks",
  "ctr",
  "cpc",
  "cpm",
  "actions",
  "action_values",
  // Graph API v25.0 rejects the legacy video_3_sec_watched_actions field.
  // The parser keeps the field for backwards-compatible historical rows, but
  // new requests must leave it out so the complete Insights payload succeeds.
  "video_thruplay_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_p95_watched_actions",
  "video_p100_watched_actions",
] as const;

export const META_DEFAULT_ATTRIBUTION_SETTINGS: MetaAttributionSettings = {
  clickWindow: "7d_click",
  viewWindow: "1d_view",
};

export const META_INSIGHT_LEVELS: MetaEntityLevel[] = ["account", "campaign", "adset", "ad"];

export const META_SYNC_LOOKBACK_DAYS = 90;
export const META_KNOWN_PROCESSING_DELAY_DAYS = 2;
export const META_TOUCHPOINT_TTL_DAYS = 30;
export const META_SYNC_TIME_BUDGET_MS = 240_000;
export const META_SYNC_PHASES = ["catalog", "account", "campaign", "adset", "ad", "placement", "finalize"] as const;
export type MetaAdsSyncPhase = (typeof META_SYNC_PHASES)[number];
export const META_PERIOD_OPTIONS = [7, 30, 90] as const;
export const META_PERIOD_RANGE_OPTIONS = ["previous_month", "custom"] as const;
export type MetaPeriodDays = (typeof META_PERIOD_OPTIONS)[number];
export type MetaPeriodSelection =
  | { kind: "days"; days: MetaPeriodDays }
  | { kind: "previous_month" }
  | { kind: "custom"; from: string; to: string };
export type MetaResolvedPeriod = { start: string; end: string; days: number };
export const DEFAULT_META_PERIOD_SELECTION: MetaPeriodSelection = { kind: "days", days: 30 };
const configuredCashCoveragePercent = Number(process.env.META_MIN_CASH_ATTRIBUTION_COVERAGE_PERCENT);
export const META_MIN_CASH_ATTRIBUTION_COVERAGE = Number.isFinite(configuredCashCoveragePercent) && configuredCashCoveragePercent >= 0 && configuredCashCoveragePercent <= 100
  ? configuredCashCoveragePercent / 100
  : 0.5;

export function normalizeMetaPeriodDays(value: unknown): (typeof META_PERIOD_OPTIONS)[number] {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 30;
  return META_PERIOD_OPTIONS.includes(parsed as (typeof META_PERIOD_OPTIONS)[number]) ? parsed as (typeof META_PERIOD_OPTIONS)[number] : 30;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMetaPeriodDays(value: number): value is MetaPeriodDays {
  return value === 7 || value === 30 || value === 90;
}

function validIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayIso(referenceDate: Date): string {
  return isoDate(new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate())));
}

function readPeriodDays(value: unknown): MetaPeriodDays | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : null;
  return typeof parsed === "number" && Number.isInteger(parsed) && isMetaPeriodDays(parsed) ? parsed : null;
}

/** Normalize query params or a period selection without trusting external values. */
export function normalizeMetaPeriodSelection(input: unknown, referenceDate = new Date()): MetaPeriodSelection {
  const record = isRecord(input) ? input : null;
  const kind = record?.kind;
  const range = record?.meta_range ?? kind;
  if (range === "previous_month") return { kind: "previous_month" };

  const from = record?.meta_from ?? record?.from;
  const to = record?.meta_to ?? record?.to;
  if (range === "custom" && validIsoDate(from) && validIsoDate(to) && from <= to && to <= todayIso(referenceDate)) {
    return { kind: "custom", from, to };
  }

  const days = readPeriodDays(record?.meta_days ?? record?.days ?? input);
  return { kind: "days", days: days ?? 30 };
}

function daysBetweenInclusive(start: string, end: string): number {
  const from = new Date(`${start}T00:00:00.000Z`);
  const to = new Date(`${end}T00:00:00.000Z`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
}

export function resolveMetaPeriod(selectionInput: unknown, referenceDate = new Date()): MetaResolvedPeriod {
  const selection = normalizeMetaPeriodSelection(selectionInput, referenceDate);
  if (selection.kind === "custom") {
    return { start: selection.from, end: selection.to, days: daysBetweenInclusive(selection.from, selection.to) };
  }

  if (selection.kind === "previous_month") {
    const firstOfCurrentMonth = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
    const end = new Date(firstOfCurrentMonth);
    end.setUTCDate(0);
    const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
    return { start: isoDate(start), end: isoDate(end), days: end.getUTCDate() };
  }

  const end = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (selection.days - 1));
  return { start: isoDate(start), end: isoDate(end), days: selection.days };
}

export function comparisonMetaPeriod(current: MetaResolvedPeriod, selectionInput?: unknown): { start: string; end: string } {
  const selection = selectionInput === undefined ? null : normalizeMetaPeriodSelection(selectionInput);
  if (selection?.kind === "previous_month") {
    const currentStart = new Date(`${current.start}T00:00:00.000Z`);
    const previousEnd = new Date(Date.UTC(currentStart.getUTCFullYear(), currentStart.getUTCMonth(), 0));
    const previousStart = new Date(Date.UTC(previousEnd.getUTCFullYear(), previousEnd.getUTCMonth(), 1));
    return { start: isoDate(previousStart), end: isoDate(previousEnd) };
  }
  const comparisonEnd = new Date(`${current.start}T00:00:00.000Z`);
  comparisonEnd.setUTCDate(comparisonEnd.getUTCDate() - 1);
  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setUTCDate(comparisonStart.getUTCDate() - (current.days - 1));
  return { start: isoDate(comparisonStart), end: isoDate(comparisonEnd) };
}

export function serializeMetaPeriodSelection(selectionInput: unknown): string {
  const selection = normalizeMetaPeriodSelection(selectionInput);
  if (selection.kind === "previous_month") return "meta_range=previous_month";
  if (selection.kind === "custom") return `meta_range=custom&meta_from=${selection.from}&meta_to=${selection.to}`;
  return `meta_days=${selection.days}`;
}

export function formatMetaPeriodRange(range: { start: string; end: string }): string {
  const formatter = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${formatter.format(new Date(`${range.start}T00:00:00.000Z`))} – ${formatter.format(new Date(`${range.end}T00:00:00.000Z`))}`;
}

export function metaPeriodSelectionLabel(selectionInput: unknown): string {
  const selection = normalizeMetaPeriodSelection(selectionInput);
  if (selection.kind === "previous_month") return "Mois précédent";
  if (selection.kind === "custom") return "Personnalisée";
  return `${selection.days} jours`;
}

function attributionWindowDays(value: string): number {
  const match = /^(\d+)d_/.exec(value);
  return match ? Number(match[1]) : 0;
}

export function computeMetaConsolidationUntil(
  date: string,
  attribution: MetaAttributionSettings = META_DEFAULT_ATTRIBUTION_SETTINGS,
  processingDelayDays = META_KNOWN_PROCESSING_DELAY_DAYS,
): Date {
  const effectiveWindowDays = Math.max(attributionWindowDays(attribution.clickWindow), attributionWindowDays(attribution.viewWindow));
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + effectiveWindowDays + processingDelayDays);
  return result;
}

export function normalizeAdAccountId(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith("act_") ? trimmed : `act_${trimmed}`;
}

export function metaAdsManagerUrl(adAccountId: string, campaignId?: string | null, adSetId?: string | null, adId?: string | null): string {
  const accountId = normalizeAdAccountId(adAccountId).replace(/^act_/, "");
  const base = `https://www.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(accountId)}`;
  const params = new URLSearchParams();
  if (campaignId) params.set("selected_campaign_ids", campaignId);
  if (adSetId) params.set("selected_adset_ids", adSetId);
  if (adId) params.set("selected_ad_ids", adId);
  const query = params.toString();
  return query ? `${base}&${query}` : base;
}

export function metaCampaignsEdge(adAccountId: string): string {
  return `${META_GRAPH_API_BASE}/${normalizeAdAccountId(adAccountId)}/campaigns`;
}

export function metaAdSetsEdge(adAccountId: string): string {
  return `${META_GRAPH_API_BASE}/${normalizeAdAccountId(adAccountId)}/adsets`;
}

export function metaAdsEdge(adAccountId: string): string {
  return `${META_GRAPH_API_BASE}/${normalizeAdAccountId(adAccountId)}/ads`;
}

export function metaInsightsEdge(adAccountId: string): string {
  return `${META_GRAPH_API_BASE}/${normalizeAdAccountId(adAccountId)}/insights`;
}
