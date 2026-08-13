export const META_CAMPAIGN_TYPES = [
  "vsl",
  "webinar",
  "instagram_profile_growth",
  "retargeting",
] as const;

export type MetaCampaignType = (typeof META_CAMPAIGN_TYPES)[number];

export const META_CONVERSION_GOALS = ["call", "sale"] as const;

export type MetaConversionGoal = (typeof META_CONVERSION_GOALS)[number];

export function campaignTypeNeedsConversionGoal(type: MetaCampaignType | null): boolean {
  return type === "vsl" || type === "webinar";
}

export const META_ENTITY_LEVELS = ["account", "campaign", "adset", "ad"] as const;

export type MetaEntityLevel = (typeof META_ENTITY_LEVELS)[number];

export const META_ACTION_TYPES = ["pause", "resume", "set_daily_budget"] as const;

export type MetaActionType = (typeof META_ACTION_TYPES)[number];

export const META_ACTION_STATUSES = [
  "requested",
  "in_progress",
  "succeeded",
  "failed",
  "permission_insufficient",
  "changed_between_proposal",
  "unknown",
  "blocked",
] as const;

export type MetaActionStatus = (typeof META_ACTION_STATUSES)[number];

export const META_WEBINAR_SOURCES = ["calendly", "iclosed", "minaly"] as const;

export type MetaWebinarSource = (typeof META_WEBINAR_SOURCES)[number];

/**
 * Optional downstream observation for webinar campaigns. Meta does not expose
 * attendance or pitch progression; until an adapter supplies this object the
 * related funnel steps and insights must remain unavailable.
 */
export type MetaWebinarObservation = {
  connected: boolean;
  source: MetaWebinarSource;
  current: { participants: number | null };
  comparison: { participants: number | null };
  coverageRate: number | null;
  comparisonCoverageRate: number | null;
};

export type MetaProvenance = {
  source:
    | "meta"
    | "meta+stripe"
    | "meta+instagram"
    | "meta+calendly"
    | "meta+iclosed"
    | "meta+minaly"
    | "meta+calendly+stripe"
    | "meta+iclosed+stripe"
    | "meta+minaly+stripe"
    | "stripe"
    | "calendly"
    | "iclosed"
    | "instagram"
    | "minaly";
  calculation: "brute" | "derivee";
  attribution: "directe" | "jointe" | "estimee" | "non_rattachee" | "indisponible";
  freshness: string;
  method?: string | null;
};

export type MetaMetricSnapshot = {
  spendCents: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  ctr: number | null;
  cpcCents: number | null;
  cpmCents: number | null;
  leads: number;
  landingPageViews: number;
  video3sViews: number;
  videoThruplay: number;
  videoP25: number;
  videoP50: number;
  videoP75: number;
  videoP95: number;
  videoP100: number;
  profileVisits: number;
  follows: number;
  registrations: number;
  purchases: number;
  purchaseValueCents: number;
  messages: number;
  provenance: MetaProvenance;
};

export type MetaRawObject = Record<string, unknown>;

export type MetaAttributionSettings = {
  clickWindow: string;
  viewWindow: string;
  breakdown?: string | null;
};

export type MetaAttributionSnapshot = {
  touchpointId: string;
  campaignExternalId: string | null;
  adSetExternalId: string | null;
  adExternalId: string | null;
  level: "ad" | "adset" | "campaign" | "utm_seul";
};

export type MetaInsightSnapshot = {
  version: 1;
  campaignType: MetaCampaignType;
  conversionGoal?: MetaConversionGoal | null;
  ruleKey: string;
  campaignId: string;
  campaignName: string;
  metricKey: string;
  currentValue: number | null;
  comparisonValue: number | null;
  comparisonLabel: string;
  periodStart: string;
  periodEnd: string;
  sampleSize: number;
  provenance: MetaProvenance;
  evidence?: string | null;
  diagnosis?: string | null;
  recommendedAction?: string | null;
  expectedImpact?: string | null;
  successCriterion?: string | null;
  confidence?: "high" | "medium" | "low" | null;
  sourceCoverage?: string | null;
  priority?: "high" | "medium" | "low" | null;
  unavailableReason?: string | null;
};
