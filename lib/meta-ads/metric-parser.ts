import { actionValue, actionValueFromList, normalizeMetaObject, parseMetaNumber, parseMetaOptionalNumber } from "./client";
import type { MetaMetricSnapshot, MetaRawObject } from "./types";

function actionCount(raw: MetaRawObject, ...types: string[]): number {
  return Math.max(0, Math.round(actionValue(raw.actions, ...types)));
}

function hasAction(raw: MetaRawObject, ...types: string[]): boolean {
  if (!Array.isArray(raw.actions)) return false;
  return raw.actions.some((item) => {
    const action = normalizeMetaObject(item);
    const actionType = action.action_type;
    return typeof actionType === "string" && types.includes(actionType);
  });
}

function videoActionCount(raw: MetaRawObject, key: string): number {
  return Math.max(0, Math.round(actionValue(raw[key])));
}

function readMetric(raw: MetaRawObject, key: string): number {
  return Math.max(0, Math.round(parseMetaNumber(raw[key])));
}

function metricAvailable(raw: MetaRawObject, key: string): boolean {
  return raw[key] !== undefined && raw[key] !== null;
}

export function parseMetaInsightMetrics(raw: MetaRawObject): Omit<MetaMetricSnapshot, "provenance"> & { availableMetrics: string[]; provenance: MetaMetricSnapshot["provenance"] } {
  const ctr = parseMetaOptionalNumber(raw.ctr);
  const cpc = parseMetaOptionalNumber(raw.cpc);
  const cpm = parseMetaOptionalNumber(raw.cpm);
  const actionValues = raw.action_values;
  const purchaseValue = actionValueFromList(actionValues, "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase");
  const availableMetrics = Object.keys(raw).filter((key) => metricAvailable(raw, key));
  const markAction = (metric: string, ...types: string[]) => {
    if (hasAction(raw, ...types)) availableMetrics.push(`meta_action:${metric}`);
  };
  markAction("leads", "lead", "onsite_conversion.lead", "offsite_conversion.fb_pixel_lead", "omni_lead");
  markAction("landingPageViews", "landing_page_view");
  markAction("profileVisits", "profile_visit", "ig_profile_visit");
  markAction("follows", "follow", "ig_follow");
  markAction("registrations", "complete_registration", "offsite_conversion.fb_pixel_complete_registration");
  markAction("purchases", "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase");
  if (purchaseValue !== null) availableMetrics.push("meta_action_value:purchases");
  markAction("messages", "onsite_conversion.messaging_conversation_started_7d", "messaging_conversation_started_7d");

  return {
    spendCents: Math.max(0, Math.round(parseMetaNumber(raw.spend) * 100)),
    impressions: readMetric(raw, "impressions"),
    reach: readMetric(raw, "reach"),
    clicks: readMetric(raw, "clicks"),
    linkClicks: readMetric(raw, "inline_link_clicks"),
    ctr: ctr === null ? null : ctr / 100,
    cpcCents: cpc === null ? null : cpc * 100,
    cpmCents: cpm === null ? null : cpm * 100,
    leads: actionCount(raw, "lead", "onsite_conversion.lead", "offsite_conversion.fb_pixel_lead", "omni_lead"),
    landingPageViews: actionCount(raw, "landing_page_view"),
    video3sViews: videoActionCount(raw, "video_3_sec_watched_actions"),
    videoThruplay: videoActionCount(raw, "video_thruplay_watched_actions"),
    videoP25: videoActionCount(raw, "video_p25_watched_actions"),
    videoP50: videoActionCount(raw, "video_p50_watched_actions"),
    videoP75: videoActionCount(raw, "video_p75_watched_actions"),
    videoP95: videoActionCount(raw, "video_p95_watched_actions"),
    videoP100: videoActionCount(raw, "video_p100_watched_actions"),
    profileVisits: actionCount(raw, "profile_visit", "ig_profile_visit"),
    follows: actionCount(raw, "follow", "ig_follow"),
    registrations: actionCount(raw, "complete_registration", "offsite_conversion.fb_pixel_complete_registration"),
    purchases: actionCount(raw, "purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"),
    purchaseValueCents: purchaseValue === null ? 0 : Math.max(0, Math.round(purchaseValue * 100)),
    messages: actionCount(raw, "onsite_conversion.messaging_conversation_started_7d", "messaging_conversation_started_7d"),
    availableMetrics,
    provenance: {
      source: "meta",
      calculation: "brute",
      attribution: "directe",
      freshness: new Date().toISOString(),
    },
  };
}
