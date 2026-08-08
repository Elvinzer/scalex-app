import type { MetaAttributionSettings, MetaEntityLevel } from "./types";

export const META_GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION ?? "v26.0";
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
  "video_3_sec_watched_actions",
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
export const META_PERIOD_OPTIONS = [7, 30, 90] as const;
const configuredCashCoveragePercent = Number(process.env.META_MIN_CASH_ATTRIBUTION_COVERAGE_PERCENT);
export const META_MIN_CASH_ATTRIBUTION_COVERAGE = Number.isFinite(configuredCashCoveragePercent) && configuredCashCoveragePercent >= 0 && configuredCashCoveragePercent <= 100
  ? configuredCashCoveragePercent / 100
  : 0.5;

export function normalizeMetaPeriodDays(value: unknown): (typeof META_PERIOD_OPTIONS)[number] {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : 30;
  return META_PERIOD_OPTIONS.includes(parsed as (typeof META_PERIOD_OPTIONS)[number]) ? parsed as (typeof META_PERIOD_OPTIONS)[number] : 30;
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
