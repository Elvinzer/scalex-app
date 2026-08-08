const CORRECTION_FIELDS = [
  "spendCents",
  "impressions",
  "reach",
  "clicks",
  "linkClicks",
  "ctr",
  "cpcCents",
  "cpmCents",
  "leads",
  "landingPageViews",
  "video3sViews",
  "videoThruplay",
  "videoP25",
  "videoP50",
  "videoP75",
  "videoP95",
  "videoP100",
  "profileVisits",
  "follows",
  "registrations",
  "purchases",
  "purchaseValueCents",
  "messages",
] as const;

const AVAILABILITY_FIELDS: Record<(typeof CORRECTION_FIELDS)[number], string[]> = {
  spendCents: ["spend"],
  impressions: ["impressions"],
  reach: ["reach"],
  clicks: ["clicks"],
  linkClicks: ["inline_link_clicks"],
  ctr: ["ctr"],
  cpcCents: ["cpc"],
  cpmCents: ["cpm"],
  leads: ["meta_action:leads"],
  landingPageViews: ["meta_action:landingPageViews"],
  video3sViews: ["video_3_sec_watched_actions"],
  videoThruplay: ["video_thruplay_watched_actions"],
  videoP25: ["video_p25_watched_actions"],
  videoP50: ["video_p50_watched_actions"],
  videoP75: ["video_p75_watched_actions"],
  videoP95: ["video_p95_watched_actions"],
  videoP100: ["video_p100_watched_actions"],
  profileVisits: ["meta_action:profileVisits"],
  follows: ["meta_action:follows"],
  registrations: ["meta_action:registrations"],
  purchases: ["meta_action:purchases"],
  purchaseValueCents: ["meta_action_value:purchases"],
  messages: ["meta_action:messages"],
};

function availableMetricsFrom(row: Record<string, unknown>): string[] | null {
  if (!Array.isArray(row.availableMetrics)) return null;
  return row.availableMetrics.filter((value): value is string => typeof value === "string");
}

/**
 * Keeps unavailable Meta metrics null in retroactive correction snapshots.
 * Older rows without an availability list retain their historical values so
 * the migration remains backwards-compatible.
 */
export function buildMetaMetricCorrectionSnapshot(row: Record<string, unknown>): Record<string, unknown> {
  const availableMetrics = availableMetricsFrom(row);
  return Object.fromEntries(
    CORRECTION_FIELDS.map((field) => {
      const isAvailable = availableMetrics === null
        || AVAILABILITY_FIELDS[field].some((metric) => availableMetrics.includes(metric));
      return [field, isAvailable ? row[field] ?? null : null];
    }),
  );
}

export function metaMetricCorrectionSnapshotChanged(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): boolean {
  return CORRECTION_FIELDS.some((field) => before[field] !== after[field]);
}
