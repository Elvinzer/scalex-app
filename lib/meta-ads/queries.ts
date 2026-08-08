import { and, desc, eq, gte, inArray, like, lte, or } from "drizzle-orm";

import { db } from "@/db";
import { insightRecords, instagramConnections, instagramPostInsights, metaAdAccounts, metaAdActionLogs, metaAdMetricCorrections, metaAdMetricsDaily, metaAdSets, metaAds, metaAdsConnections, metaAdTouchpoints, metaCampaignProfiles, metaCampaigns, nativeBookingLeads, sales, salesCalls } from "@/db/schema";
import type { InsightDecision, InsightSnapshot } from "@/lib/insight-execution/types";
import { countUnattributedMetaSales, metaSalesCoverageRate, resolveMetaTouchpointCampaign } from "./attribution-resolution";
import { META_MIN_CASH_ATTRIBUTION_COVERAGE, META_TOUCHPOINT_TTL_DAYS, metaAdsManagerUrl, normalizeMetaPeriodDays } from "./protocol";
import { META_INSIGHT_THRESHOLDS } from "./thresholds";
import { META_CAMPAIGN_TYPES, type MetaCampaignType, type MetaRawObject } from "./types";

export type MetaMetricTotals = {
  spendCents: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  leads: number;
  landingPageViews: number;
  video3sViews: number;
  videoThruplay: number;
  profileVisits: number;
  follows: number;
  registrations: number;
  purchases: number;
  purchaseValueCents: number;
  messages: number;
  metaProvided: {
    ctr: number | null;
    cpcCents: number | null;
    cpmCents: number | null;
    rowCount: number;
    availableRows: Record<MetaRawMetricKey, number>;
  };
  available: Record<MetaMetricKey, boolean>;
};

export type MetaRawMetricKey = "ctr" | "cpcCents" | "cpmCents";

export type MetaMetricKey =
  | "spendCents"
  | "impressions"
  | "reach"
  | "clicks"
  | "linkClicks"
  | "leads"
  | "landingPageViews"
  | "video3sViews"
  | "videoThruplay"
  | "profileVisits"
  | "follows"
  | "registrations"
  | "purchases"
  | "purchaseValueCents"
  | "messages";

export type MetaCampaignDashboardRow = {
  id: string;
  externalId: string;
  name: string;
  objective: string | null;
  effectiveStatus: string | null;
  campaignType: MetaCampaignType;
  typeSource: string;
  targets?: {
    targetCpaCents: number | null;
    targetRoas: number | null;
    leadValueCents: number | null;
  };
  metrics: MetaMetricTotals;
  comparisonMetrics: MetaMetricTotals;
  metricCoverageRate?: number | null;
  comparisonMetricCoverageRate?: number | null;
  retargetingAudiences?: MetaRetargetingAudienceSignal[];
  instagramObservation?: MetaInstagramObservation;
  cash?: {
    revenueCents: number | null;
    sales: number;
    available: boolean;
    comparisonRevenueCents: number | null;
    comparisonSales: number;
    comparisonAvailable: boolean;
    coverageRate: number | null;
    comparisonCoverageRate: number | null;
  };
  latestDate: string | null;
};

export type MetaInstagramObservation = {
  connected: boolean;
  current: {
    follows: number | null;
    interactions: number | null;
    engagementPerFollower: number | null;
  };
  comparison: {
    follows: number | null;
    interactions: number | null;
    engagementPerFollower: number | null;
  };
};

export type MetaAudienceSummary = {
  adSetId: string;
  adSetName: string;
  deepLink: string;
  active: boolean;
  included: string[];
  excluded: string[];
  windowDays: number | null;
  spendCents: number | null;
  leads: number | null;
  cpaCents: number | null;
  targetingAvailable: boolean;
};

export type MetaRetargetingAudienceSignal = {
  adSetId: string;
  adSetName: string;
  active: boolean;
  included: string[];
  excluded: string[];
  buyerAudienceDetected: boolean;
  buyerAudienceExcluded: boolean;
  windowDays: number | null;
  spendCents: number | null;
  leads: number | null;
  cpaCents: number | null;
  targetingAvailable: boolean;
};

export type MetaAdsDashboard = {
  connected: true;
  account: {
    id: string;
    externalId: string;
    name: string;
    currency: string | null;
    timezone: string | null;
  };
  connection: {
    status: string;
    initialSyncStatus: string;
    lastSyncCompletedAt: string | null;
    lastSyncError: string | null;
    grantedScopes: string[];
  };
  period: { start: string; end: string; days: number; consolidatedThrough: string | null };
  comparisonPeriod: { start: string; end: string };
  frequencySaturationThreshold: number;
  missingMetricDates: string[];
  totals: MetaMetricTotals;
  comparisonTotals: MetaMetricTotals;
  corrections: Array<{
    id: string;
    date: string;
    level: string;
    entityKey: string;
    reason: string;
    beforeSnapshot: Record<string, unknown>;
    afterSnapshot: Record<string, unknown>;
    createdAt: string;
  }>;
  instagramObservation: MetaInstagramObservation;
  campaigns: MetaCampaignDashboardRow[];
};

export type MetaCampaignDetail = {
  dashboard: MetaAdsDashboard;
  campaign: MetaCampaignDashboardRow & {
    landingPageUrl: string | null;
    dailyBudgetCents: number | null;
    lifetimeBudgetCents: number | null;
  };
  daily: Array<{
    date: string;
    spendCents: number | null;
    impressions: number | null;
    linkClicks: number | null;
    leads: number | null;
    video3sViews: number | null;
    videoThruplay: number | null;
  }>;
  adSets: Array<{ id: string; externalId: string; name: string; status: string | null; deepLink: string; metrics: MetaMetricTotals }>;
  ads: Array<{ id: string; externalId: string; name: string; status: string | null; creativeName: string | null; thumbnailUrl: string | null; deepLink: string; metrics: MetaMetricTotals }>;
  placements: Array<{ publisherPlatform: string; platformPosition: string; deepLink: string; metrics: MetaMetricTotals }>;
  audiences: MetaAudienceSummary[];
  attributionQuality: {
    status: "unavailable" | "partial" | "verified";
    touchpoints: number;
    levels: { ad: number; adset: number; campaign: number; utm_seul: number };
    levelCoverage: { ad: number | null; adset: number | null; campaign: number | null; utm_seul: number | null };
    leads: number;
    bookedCalls: number;
    closedCalls: number;
    sales: number;
    revenueCents: number | null;
    salesInPeriod: number;
    unattributedSalesInPeriod: number;
    coverageRate: number | null;
  };
  insights: Array<{
    id: string;
    title: string;
    insightText: string;
    decision: InsightDecision;
    snapshot: InsightSnapshot;
  }>;
  actionLogs: Array<{
    id: string;
    entityType: string;
    entityExternalId: string;
    actionType: string;
    status: string;
    requestedState: Record<string, unknown>;
    resultState: Record<string, unknown> | null;
    errorMessage: string | null;
    createdAt: string;
  }>;
};

const EMPTY_TOTALS: MetaMetricTotals = {
  spendCents: 0,
  impressions: 0,
  reach: 0,
  clicks: 0,
  linkClicks: 0,
  leads: 0,
  landingPageViews: 0,
  video3sViews: 0,
  videoThruplay: 0,
  profileVisits: 0,
  follows: 0,
  registrations: 0,
  purchases: 0,
  purchaseValueCents: 0,
  messages: 0,
  metaProvided: {
    ctr: null,
    cpcCents: null,
    cpmCents: null,
    rowCount: 0,
    availableRows: { ctr: 0, cpcCents: 0, cpmCents: 0 },
  },
  available: {
    spendCents: false,
    impressions: false,
    reach: false,
    clicks: false,
    linkClicks: false,
    leads: false,
    landingPageViews: false,
    video3sViews: false,
    videoThruplay: false,
    profileVisits: false,
    follows: false,
    registrations: false,
    purchases: false,
    purchaseValueCents: false,
    messages: false,
  },
};

function rawString(raw: MetaRawObject, key: string): string | null {
  const value = raw[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function targetingLabels(targeting: MetaRawObject | null, key: "custom_audiences" | "excluded_custom_audiences"): string[] {
  const value = targeting?.[key];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string" && item.trim() !== "") return [item.trim()];
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    const record = Object.fromEntries(Object.entries(item));
    const label = typeof record.name === "string" && record.name.trim() !== ""
      ? record.name.trim()
      : typeof record.id === "string" && record.id.trim() !== ""
        ? `Audience ${record.id.trim()}`
        : null;
    return label ? [label] : [];
  });
}

const BUYER_AUDIENCE_PATTERN = /(?:buyer|purchas|customer|client|acheteur|ancien[-_ ]client|paid)/i;
const AUDIENCE_WINDOW_PATTERN = /(?:^|[^\d])([1-9]\d{0,2})\s*(?:d|day|days|jour|jours)(?:$|[^a-z])/i;

function audienceWindowDays(labels: string[]): number | null {
  const windows = labels
    .map((label) => label.match(AUDIENCE_WINDOW_PATTERN)?.[1])
    .filter((value): value is string => Boolean(value))
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0 && value <= 365);
  return new Set(windows).size === 1 ? windows[0] ?? null : null;
}

const availabilityFields: Record<MetaMetricKey, string[]> = {
  spendCents: ["spend"],
  impressions: ["impressions"],
  reach: ["reach"],
  clicks: ["clicks"],
  linkClicks: ["inline_link_clicks"],
  leads: ["meta_action:leads"],
  landingPageViews: ["meta_action:landingPageViews"],
  video3sViews: ["video_3_sec_watched_actions"],
  videoThruplay: ["video_thruplay_watched_actions"],
  profileVisits: ["meta_action:profileVisits"],
  follows: ["meta_action:follows"],
  registrations: ["meta_action:registrations"],
  purchases: ["meta_action:purchases"],
  purchaseValueCents: ["meta_action_value:purchases"],
  messages: ["meta_action:messages"],
};

function emptyTotals(): MetaMetricTotals {
  return {
    ...EMPTY_TOTALS,
    metaProvided: {
      ...EMPTY_TOTALS.metaProvided,
      availableRows: { ...EMPTY_TOTALS.metaProvided.availableRows },
    },
    available: { ...EMPTY_TOTALS.available },
  };
}

function addTotals(target: MetaMetricTotals, row: typeof metaAdMetricsDaily.$inferSelect): void {
  const previousImpressions = target.impressions;
  const previousLinkClicks = target.linkClicks;
  target.spendCents += row.spendCents;
  target.impressions += row.impressions;
  // Reach is not additive across days. We expose the sum only as a
  // directional fallback; the detail view labels it as non-deduplicated.
  target.reach += row.reach;
  target.clicks += row.clicks;
  target.linkClicks += row.linkClicks;
  target.leads += row.leads;
  target.landingPageViews += row.landingPageViews;
  target.video3sViews += row.video3sViews;
  target.videoThruplay += row.videoThruplay;
  target.profileVisits += row.profileVisits;
  target.follows += row.follows;
  target.registrations += row.registrations;
  target.purchases += row.purchases;
  target.purchaseValueCents += row.purchaseValueCents;
  target.messages += row.messages;
  target.metaProvided.rowCount += 1;
  const rawMetrics: Array<{ key: MetaRawMetricKey; value: number | null; availableField: string; weight: number }> = [
    { key: "ctr", value: row.ctr, availableField: "ctr", weight: row.impressions },
    { key: "cpcCents", value: row.cpcCents, availableField: "cpc", weight: row.linkClicks },
    { key: "cpmCents", value: row.cpmCents, availableField: "cpm", weight: row.impressions },
  ];
  for (const metric of rawMetrics) {
    if (!row.availableMetrics.includes(metric.availableField) || metric.value === null || !Number.isFinite(metric.value)) continue;
    target.metaProvided.availableRows[metric.key] += 1;
    const previousWeight = metric.key === "cpcCents" ? previousLinkClicks : previousImpressions;
    const totalWeight = previousWeight + metric.weight;
    if (totalWeight <= 0) {
      target.metaProvided[metric.key] = metric.value;
      continue;
    }
    target.metaProvided[metric.key] = (
      (target.metaProvided[metric.key] ?? 0) * previousWeight + metric.value * metric.weight
    ) / totalWeight;
  }
  for (const key of Object.keys(availabilityFields) as MetaMetricKey[]) {
    if (availabilityFields[key].some((field) => row.availableMetrics.includes(field))) target.available[key] = true;
  }
}

export function metricValue(metrics: MetaMetricTotals, key: MetaMetricKey): number | null {
  return metrics.available[key] ? metrics[key] : null;
}

/**
 * Returns a period-level metric exactly as supplied by Meta only when every
 * synchronized row in the aggregate supplied that raw field. Otherwise the
 * caller must use its deterministic fallback and label it as derived.
 */
export function rawMetaMetricValue(metrics: MetaMetricTotals, key: MetaRawMetricKey): number | null {
  if (metrics.metaProvided.rowCount === 0 || metrics.metaProvided.availableRows[key] !== metrics.metaProvided.rowCount) return null;
  return metrics.metaProvided[key];
}

function campaignType(value: string): MetaCampaignType {
  return META_CAMPAIGN_TYPES.includes(value as MetaCampaignType) ? (value as MetaCampaignType) : "other";
}

function period(days: number): { start: string; end: string; days: number } {
  const end = new Date();
  const start = new Date(end);
  // Both bounds are inclusive in the SQL filters below. Subtract days - 1 so
  // a "30 days" window contains exactly 30 calendar dates and coverage cannot
  // look complete while one day is missing.
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10), days };
}

function comparisonPeriod(current: { start: string; end: string; days: number }): { start: string; end: string } {
  const start = new Date(`${current.start}T00:00:00.000Z`);
  const comparisonEnd = new Date(start);
  comparisonEnd.setUTCDate(comparisonEnd.getUTCDate() - 1);
  const comparisonStart = new Date(comparisonEnd);
  comparisonStart.setUTCDate(comparisonStart.getUTCDate() - (current.days - 1));
  return { start: comparisonStart.toISOString().slice(0, 10), end: comparisonEnd.toISOString().slice(0, 10) };
}

function calendarDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const last = new Date(`${end}T00:00:00.000Z`);
  while (cursor <= last) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function aggregateInstagramObservation(
  rows: Array<{ follows: number | null; totalInteractions: number | null }>,
): MetaInstagramObservation["current"] {
  const follows = rows.some((row) => row.follows !== null)
    ? rows.reduce((total, row) => total + (row.follows ?? 0), 0)
    : null;
  const interactions = rows.some((row) => row.totalInteractions !== null)
    ? rows.reduce((total, row) => total + (row.totalInteractions ?? 0), 0)
    : null;
  return {
    follows,
    interactions,
    engagementPerFollower: follows !== null && follows > 0 && interactions !== null ? interactions / follows : null,
  };
}

export async function getMetaAdsDashboard(accountId: string, requestedDays: unknown = 30): Promise<MetaAdsDashboard | null> {
  const [connection] = await db
    .select()
    .from(metaAdsConnections)
    .where(eq(metaAdsConnections.userId, accountId))
    .limit(1);
  if (!connection?.selectedAdAccountId) return null;

  const [account] = await db
    .select()
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.userId, accountId), eq(metaAdAccounts.connectionId, connection.id), eq(metaAdAccounts.externalId, connection.selectedAdAccountId)))
    .limit(1);
  if (!account) return null;

  const currentPeriod = period(normalizeMetaPeriodDays(requestedDays));
  const previousPeriod = comparisonPeriod(currentPeriod);
  const [campaignRows, metricRows, comparisonRows, adSetRowsForAudience, adRowsForTouchpoints, adSetMetricRows, correctionRows, instagramConnectionRows, instagramRows, comparisonInstagramRows, touchpointRows, salesRows] = await Promise.all([
    db
      .select({ campaign: metaCampaigns, profile: metaCampaignProfiles })
      .from(metaCampaigns)
      .leftJoin(metaCampaignProfiles, and(eq(metaCampaignProfiles.campaignId, metaCampaigns.id), eq(metaCampaignProfiles.userId, accountId)))
      .where(and(eq(metaCampaigns.userId, accountId), eq(metaCampaigns.adAccountId, account.id)))
      .orderBy(desc(metaCampaigns.lastSeenAt)),
    db
      .select()
      .from(metaAdMetricsDaily)
      .where(
        and(
          eq(metaAdMetricsDaily.userId, accountId),
          eq(metaAdMetricsDaily.adAccountId, account.id),
          eq(metaAdMetricsDaily.level, "campaign"),
          gte(metaAdMetricsDaily.date, currentPeriod.start),
          lte(metaAdMetricsDaily.date, currentPeriod.end),
        ),
      )
      .orderBy(desc(metaAdMetricsDaily.date)),
    db
      .select()
      .from(metaAdMetricsDaily)
      .where(
        and(
          eq(metaAdMetricsDaily.userId, accountId),
          eq(metaAdMetricsDaily.adAccountId, account.id),
          eq(metaAdMetricsDaily.level, "campaign"),
          gte(metaAdMetricsDaily.date, previousPeriod.start),
          lte(metaAdMetricsDaily.date, previousPeriod.end),
        ),
      )
      .orderBy(desc(metaAdMetricsDaily.date)),
    db
      .select()
      .from(metaAdSets)
      .where(and(eq(metaAdSets.userId, accountId), eq(metaAdSets.adAccountId, account.id))),
    db
      .select({ externalId: metaAds.externalId, campaignId: metaAds.campaignId })
      .from(metaAds)
      .where(and(eq(metaAds.userId, accountId), eq(metaAds.adAccountId, account.id))),
    db
      .select()
      .from(metaAdMetricsDaily)
      .where(
        and(
          eq(metaAdMetricsDaily.userId, accountId),
          eq(metaAdMetricsDaily.adAccountId, account.id),
          eq(metaAdMetricsDaily.level, "adset"),
          gte(metaAdMetricsDaily.date, currentPeriod.start),
          lte(metaAdMetricsDaily.date, currentPeriod.end),
        ),
      ),
    db
      .select({
        id: metaAdMetricCorrections.id,
        date: metaAdMetricCorrections.date,
        level: metaAdMetricCorrections.level,
        entityKey: metaAdMetricCorrections.entityKey,
        reason: metaAdMetricCorrections.reason,
        beforeSnapshot: metaAdMetricCorrections.beforeSnapshot,
        afterSnapshot: metaAdMetricCorrections.afterSnapshot,
        createdAt: metaAdMetricCorrections.createdAt,
      })
      .from(metaAdMetricCorrections)
      .where(
        and(
          eq(metaAdMetricCorrections.userId, accountId),
          eq(metaAdMetricCorrections.adAccountId, account.id),
          gte(metaAdMetricCorrections.date, currentPeriod.start),
          lte(metaAdMetricCorrections.date, currentPeriod.end),
        ),
      )
      .orderBy(desc(metaAdMetricCorrections.createdAt))
      .limit(20),
    db
      .select({ id: instagramConnections.id })
      .from(instagramConnections)
      .where(eq(instagramConnections.userId, accountId))
      .limit(1),
    db
      .select({ follows: instagramPostInsights.follows, totalInteractions: instagramPostInsights.totalInteractions })
      .from(instagramPostInsights)
      .where(
        and(
          eq(instagramPostInsights.userId, accountId),
          gte(instagramPostInsights.mediaPublishedAt, new Date(`${currentPeriod.start}T00:00:00.000Z`)),
          lte(instagramPostInsights.mediaPublishedAt, new Date(`${currentPeriod.end}T23:59:59.999Z`)),
        ),
      ),
    db
      .select({ follows: instagramPostInsights.follows, totalInteractions: instagramPostInsights.totalInteractions })
      .from(instagramPostInsights)
      .where(
        and(
          eq(instagramPostInsights.userId, accountId),
          gte(instagramPostInsights.mediaPublishedAt, new Date(`${previousPeriod.start}T00:00:00.000Z`)),
          lte(instagramPostInsights.mediaPublishedAt, new Date(`${previousPeriod.end}T23:59:59.999Z`)),
        ),
      ),
    db
      .select({
        id: metaAdTouchpoints.id,
        adExternalId: metaAdTouchpoints.adExternalId,
        adSetExternalId: metaAdTouchpoints.adSetExternalId,
        campaignExternalId: metaAdTouchpoints.campaignExternalId,
      })
      .from(metaAdTouchpoints)
      .where(eq(metaAdTouchpoints.userId, accountId)),
    db
      .select({ totalPrice: sales.totalPrice, metaTouchpointId: sales.metaTouchpointId, saleDate: sales.saleDate })
      .from(sales)
      .where(and(eq(sales.userId, accountId), gte(sales.saleDate, previousPeriod.start), lte(sales.saleDate, currentPeriod.end))),
  ]);

  const campaignExternalIds = new Set(campaignRows.map(({ campaign }) => campaign.externalId));
  const campaignExternalById = new Map(campaignRows.map(({ campaign }) => [campaign.id, campaign.externalId]));
  const adSetCampaigns = new Map(
    adSetRowsForAudience.flatMap((row) => {
      const campaignExternalId = campaignExternalById.get(row.campaignId);
      return campaignExternalId ? [[row.externalId, campaignExternalId] as const] : [];
    }),
  );
  const adCampaigns = new Map(
    adRowsForTouchpoints.flatMap((row) => {
      const campaignExternalId = campaignExternalById.get(row.campaignId);
      return campaignExternalId ? [[row.externalId, campaignExternalId] as const] : [];
    }),
  );
  const touchpointCampaigns = new Map<string, string>();
  for (const row of touchpointRows) {
    const campaignExternalId = resolveMetaTouchpointCampaign(row, campaignExternalIds, adSetCampaigns, adCampaigns);
    if (campaignExternalId) touchpointCampaigns.set(row.id, campaignExternalId);
  }
  const periodSales = (start: string, end: string) => salesRows.filter((sale) => sale.saleDate >= start && sale.saleDate <= end);
  const currentSales = periodSales(currentPeriod.start, currentPeriod.end);
  const previousSales = periodSales(previousPeriod.start, previousPeriod.end);
  const knownTouchpointIds = new Set(touchpointCampaigns.keys());
  const currentCoverageRate = metaSalesCoverageRate(currentSales, knownTouchpointIds);
  const comparisonCoverageRate = metaSalesCoverageRate(previousSales, knownTouchpointIds);
  const revenueByCampaign = (rows: typeof salesRows) => {
    const result = new Map<string, { revenueCents: number; sales: number }>();
    for (const sale of rows) {
      const campaignExternalId = sale.metaTouchpointId ? touchpointCampaigns.get(sale.metaTouchpointId) : null;
      if (!campaignExternalId) continue;
      const aggregate = result.get(campaignExternalId) ?? { revenueCents: 0, sales: 0 };
      aggregate.revenueCents += sale.totalPrice * 100;
      aggregate.sales += 1;
      result.set(campaignExternalId, aggregate);
    }
    return result;
  };
  const currentRevenueByCampaign = revenueByCampaign(currentSales);
  const comparisonRevenueByCampaign = revenueByCampaign(previousSales);
  const currentInstagramObservation = aggregateInstagramObservation(instagramRows);
  const comparisonInstagramObservation = aggregateInstagramObservation(comparisonInstagramRows);

  const currentAdSetMetrics = new Map<string, MetaMetricTotals>();
  for (const row of adSetMetricRows) {
    if (!row.adSetExternalId) continue;
    const aggregate = currentAdSetMetrics.get(row.adSetExternalId) ?? emptyTotals();
    addTotals(aggregate, row);
    currentAdSetMetrics.set(row.adSetExternalId, aggregate);
  }
  const retargetingAudiencesByCampaign = new Map<string, MetaRetargetingAudienceSignal[]>();
  for (const adSet of adSetRowsForAudience) {
    const campaignExternalId = campaignExternalById.get(adSet.campaignId);
    if (!campaignExternalId) continue;
    const included = targetingLabels(adSet.targeting, "custom_audiences");
    const excluded = targetingLabels(adSet.targeting, "excluded_custom_audiences");
    const metrics = currentAdSetMetrics.get(adSet.externalId) ?? emptyTotals();
    const spendCents = metricValue(metrics, "spendCents");
    const leads = metricValue(metrics, "leads");
    const cpaCents = spendCents !== null && leads !== null && leads > 0 ? spendCents / leads : null;
    const signal: MetaRetargetingAudienceSignal = {
      adSetId: adSet.id,
      adSetName: adSet.name,
      active: (adSet.effectiveStatus ?? adSet.status) === "ACTIVE",
      included,
      excluded,
      buyerAudienceDetected: included.some((label) => BUYER_AUDIENCE_PATTERN.test(label)),
      buyerAudienceExcluded: excluded.some((label) => BUYER_AUDIENCE_PATTERN.test(label)),
      windowDays: audienceWindowDays(included),
      spendCents,
      leads,
      cpaCents,
      targetingAvailable: adSet.targeting !== null,
    };
    const campaignSignals = retargetingAudiencesByCampaign.get(campaignExternalId) ?? [];
    campaignSignals.push(signal);
    retargetingAudiencesByCampaign.set(campaignExternalId, campaignSignals);
  }

  const byCampaign = new Map<string, MetaMetricTotals>();
  const latestByCampaign = new Map<string, string>();
  const metricDaysByCampaign = new Map<string, Set<string>>();
  const totals = emptyTotals();
  const comparisonByCampaign = new Map<string, MetaMetricTotals>();
  const comparisonMetricDaysByCampaign = new Map<string, Set<string>>();
  const comparisonTotals = emptyTotals();
  for (const row of metricRows) {
    const externalId = row.campaignExternalId;
    if (!externalId) continue;
    const aggregate = byCampaign.get(externalId) ?? emptyTotals();
    addTotals(aggregate, row);
    byCampaign.set(externalId, aggregate);
    const metricDays = metricDaysByCampaign.get(externalId) ?? new Set<string>();
    metricDays.add(row.date);
    metricDaysByCampaign.set(externalId, metricDays);
    if (!latestByCampaign.has(externalId)) latestByCampaign.set(externalId, row.date);
    addTotals(totals, row);
  }
  for (const row of comparisonRows) {
    const externalId = row.campaignExternalId;
    if (!externalId) continue;
    const aggregate = comparisonByCampaign.get(externalId) ?? emptyTotals();
    addTotals(aggregate, row);
    comparisonByCampaign.set(externalId, aggregate);
    const metricDays = comparisonMetricDaysByCampaign.get(externalId) ?? new Set<string>();
    metricDays.add(row.date);
    comparisonMetricDaysByCampaign.set(externalId, metricDays);
    addTotals(comparisonTotals, row);
  }
  const now = new Date();
  const synchronizedDates = new Set(metricRows.map((row) => row.date));
  const missingMetricDates = calendarDates(currentPeriod.start, currentPeriod.end).filter((date) => !synchronizedDates.has(date));
  const consolidatedThrough = metricRows.reduce<string | null>((latest, row) => {
    if (!row.consolidationUntil || row.consolidationUntil > now) return latest;
    return !latest || row.date > latest ? row.date : latest;
  }, null);

  return {
    connected: true,
    account: {
      id: account.id,
      externalId: account.externalId,
      name: account.name,
      currency: account.currency,
      timezone: account.timezone,
    },
    connection: {
      status: connection.status,
      initialSyncStatus: connection.initialSyncStatus,
      lastSyncCompletedAt: connection.lastSyncCompletedAt?.toISOString() ?? null,
      lastSyncError: connection.lastSyncError,
      grantedScopes: connection.grantedScopes,
    },
    period: { ...currentPeriod, consolidatedThrough },
    comparisonPeriod: previousPeriod,
    frequencySaturationThreshold: META_INSIGHT_THRESHOLDS.retargetingFrequencySaturation,
    missingMetricDates,
    totals,
    comparisonTotals,
    corrections: correctionRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    instagramObservation: {
      connected: instagramConnectionRows.length > 0,
      current: currentInstagramObservation,
      comparison: comparisonInstagramObservation,
    },
    campaigns: campaignRows.map(({ campaign, profile }) => ({
      id: campaign.id,
      externalId: campaign.externalId,
      name: campaign.name,
      objective: campaign.objective,
      effectiveStatus: campaign.effectiveStatus,
      campaignType: campaignType(profile?.campaignType ?? campaign.campaignType),
      typeSource: profile?.typeSource ?? "heuristic",
      targets: {
        targetCpaCents: profile?.targetCpaCents ?? null,
        targetRoas: profile?.targetRoas ?? null,
        leadValueCents: profile?.leadValueCents ?? null,
      },
      metrics: byCampaign.get(campaign.externalId) ?? emptyTotals(),
      comparisonMetrics: comparisonByCampaign.get(campaign.externalId) ?? emptyTotals(),
      metricCoverageRate: metricDaysByCampaign.has(campaign.externalId)
        ? Math.min(1, (metricDaysByCampaign.get(campaign.externalId)?.size ?? 0) / currentPeriod.days)
        : null,
      comparisonMetricCoverageRate: comparisonMetricDaysByCampaign.has(campaign.externalId)
        ? Math.min(1, (comparisonMetricDaysByCampaign.get(campaign.externalId)?.size ?? 0) / currentPeriod.days)
        : null,
      retargetingAudiences: retargetingAudiencesByCampaign.get(campaign.externalId) ?? [],
      instagramObservation: {
        connected: instagramConnectionRows.length > 0,
        current: currentInstagramObservation,
        comparison: comparisonInstagramObservation,
      },
      cash: (() => {
        const currentCash = currentRevenueByCampaign.get(campaign.externalId);
        const comparisonCash = comparisonRevenueByCampaign.get(campaign.externalId);
        const currentAvailable = currentCash !== undefined && currentCoverageRate !== null && currentCoverageRate >= META_MIN_CASH_ATTRIBUTION_COVERAGE;
        const comparisonAvailable = comparisonCash !== undefined && comparisonCoverageRate !== null && comparisonCoverageRate >= META_MIN_CASH_ATTRIBUTION_COVERAGE;
        return {
          revenueCents: currentAvailable ? currentCash.revenueCents : null,
          sales: currentCash?.sales ?? 0,
          available: currentAvailable,
          comparisonRevenueCents: comparisonAvailable ? comparisonCash.revenueCents : null,
          comparisonSales: comparisonCash?.sales ?? 0,
          comparisonAvailable,
          coverageRate: currentCoverageRate,
          comparisonCoverageRate,
        };
      })(),
      latestDate: latestByCampaign.get(campaign.externalId) ?? null,
    })),
  };
}

export async function getMetaCampaignDetail(accountId: string, campaignId: string, requestedDays: unknown = 30, dashboardOverride?: MetaAdsDashboard): Promise<MetaCampaignDetail | null> {
  const dashboard = dashboardOverride ?? await getMetaAdsDashboard(accountId, requestedDays);
  if (!dashboard) return null;
  const [campaignRow] = await db
    .select({ campaign: metaCampaigns, profile: metaCampaignProfiles })
    .from(metaCampaigns)
    .leftJoin(metaCampaignProfiles, and(eq(metaCampaignProfiles.campaignId, metaCampaigns.id), eq(metaCampaignProfiles.userId, accountId)))
    .where(and(eq(metaCampaigns.id, campaignId), eq(metaCampaigns.userId, accountId)))
    .limit(1);
  if (!campaignRow || campaignRow.campaign.adAccountId !== dashboard.account.id) return null;
  const selectedCampaign = dashboard.campaigns.find((campaign) => campaign.id === campaignId);
  if (!selectedCampaign) return null;

  const touchpointPeriodStart = new Date(`${dashboard.period.start}T00:00:00.000Z`);
  touchpointPeriodStart.setUTCDate(touchpointPeriodStart.getUTCDate() - META_TOUCHPOINT_TTL_DAYS);
  const touchpointPeriodEnd = new Date(`${dashboard.period.end}T23:59:59.999Z`);
  const periodStartDate = new Date(`${dashboard.period.start}T00:00:00.000Z`);
  const periodEndDate = new Date(`${dashboard.period.end}T23:59:59.999Z`);
  const [allAdSetRows, allAdRows] = await Promise.all([
    db.select().from(metaAdSets).where(and(eq(metaAdSets.userId, accountId), eq(metaAdSets.adAccountId, dashboard.account.id))).orderBy(metaAdSets.name),
    db.select().from(metaAds).where(and(eq(metaAds.userId, accountId), eq(metaAds.adAccountId, dashboard.account.id))).orderBy(metaAds.name),
  ]);
  const adSetRows = allAdSetRows.filter((row) => row.campaignId === campaignId);
  const adRows = allAdRows.filter((row) => row.campaignId === campaignId);
  const touchpointEntityFilter = or(
    eq(metaAdTouchpoints.campaignExternalId, campaignRow.campaign.externalId),
    ...(adSetRows.length > 0 ? [inArray(metaAdTouchpoints.adSetExternalId, adSetRows.map((row) => row.externalId))] : []),
    ...(adRows.length > 0 ? [inArray(metaAdTouchpoints.adExternalId, adRows.map((row) => row.externalId))] : []),
  );
  const [metricRows, placementRows, insightRows, touchpointRows, knownTouchpointRows] = await Promise.all([
    db
      .select()
      .from(metaAdMetricsDaily)
      .where(
        and(
          eq(metaAdMetricsDaily.userId, accountId),
          eq(metaAdMetricsDaily.adAccountId, dashboard.account.id),
          eq(metaAdMetricsDaily.campaignExternalId, campaignRow.campaign.externalId),
          gte(metaAdMetricsDaily.date, dashboard.period.start),
          lte(metaAdMetricsDaily.date, dashboard.period.end),
        ),
      )
      .orderBy(metaAdMetricsDaily.date),
    db
      .select()
      .from(metaAdMetricsDaily)
      .where(
        and(
          eq(metaAdMetricsDaily.userId, accountId),
          eq(metaAdMetricsDaily.adAccountId, dashboard.account.id),
          eq(metaAdMetricsDaily.level, "placement"),
          eq(metaAdMetricsDaily.campaignExternalId, campaignRow.campaign.externalId),
          gte(metaAdMetricsDaily.date, dashboard.period.start),
          lte(metaAdMetricsDaily.date, dashboard.period.end),
        ),
      )
      .orderBy(metaAdMetricsDaily.date),
    db
      .select({ id: insightRecords.id, title: insightRecords.title, insightText: insightRecords.insightText, decision: insightRecords.decision, snapshot: insightRecords.snapshot })
      .from(insightRecords)
      .where(and(eq(insightRecords.userId, accountId), eq(insightRecords.sourceType, "meta_ads"), like(insightRecords.sourceId, `${campaignId}:%`)))
      .orderBy(desc(insightRecords.updatedAt)),
    db
      .select({
        id: metaAdTouchpoints.id,
        adExternalId: metaAdTouchpoints.adExternalId,
        adSetExternalId: metaAdTouchpoints.adSetExternalId,
        campaignExternalId: metaAdTouchpoints.campaignExternalId,
      })
      .from(metaAdTouchpoints)
      .where(
        and(
          eq(metaAdTouchpoints.userId, accountId),
          touchpointEntityFilter,
          gte(metaAdTouchpoints.capturedAt, touchpointPeriodStart),
          lte(metaAdTouchpoints.capturedAt, touchpointPeriodEnd),
        ),
      ),
    db
      .select({
        id: metaAdTouchpoints.id,
        adExternalId: metaAdTouchpoints.adExternalId,
        adSetExternalId: metaAdTouchpoints.adSetExternalId,
        campaignExternalId: metaAdTouchpoints.campaignExternalId,
      })
      .from(metaAdTouchpoints)
      .where(eq(metaAdTouchpoints.userId, accountId)),
  ]);

  const touchpointIds = touchpointRows.map((row) => row.id);
  const campaignExternalIds = new Set(dashboard.campaigns.map((campaign) => campaign.externalId));
  const campaignExternalById = new Map(dashboard.campaigns.map((campaign) => [campaign.id, campaign.externalId]));
  const adSetCampaigns = new Map(
    allAdSetRows.flatMap((row) => {
      const campaignExternalId = campaignExternalById.get(row.campaignId);
      return campaignExternalId ? [[row.externalId, campaignExternalId] as const] : [];
    }),
  );
  const adCampaigns = new Map(
    allAdRows.flatMap((row) => {
      const campaignExternalId = campaignExternalById.get(row.campaignId);
      return campaignExternalId ? [[row.externalId, campaignExternalId] as const] : [];
    }),
  );
  const knownTouchpointIds = new Set(
    knownTouchpointRows
      .filter((row) => resolveMetaTouchpointCampaign(row, campaignExternalIds, adSetCampaigns, adCampaigns) !== null)
      .map((row) => row.id),
  );
  const levels = touchpointRows.reduce(
    (counts, row) => {
      if (row.adExternalId) counts.ad += 1;
      else if (row.adSetExternalId) counts.adset += 1;
      else if (row.campaignExternalId) counts.campaign += 1;
      else counts.utm_seul += 1;
      return counts;
    },
    { ad: 0, adset: 0, campaign: 0, utm_seul: 0 },
  );
  const [leadRows, callRows, saleRows] = touchpointIds.length
    ? await Promise.all([
        db
          .select({ id: nativeBookingLeads.id })
          .from(nativeBookingLeads)
          .where(and(eq(nativeBookingLeads.userId, accountId), inArray(nativeBookingLeads.metaTouchpointId, touchpointIds), gte(nativeBookingLeads.createdAt, periodStartDate), lte(nativeBookingLeads.createdAt, periodEndDate))),
        db
          .select({ id: salesCalls.id, attendance: salesCalls.attendance, outcome: salesCalls.outcome })
          .from(salesCalls)
          .where(and(eq(salesCalls.userId, accountId), inArray(salesCalls.metaTouchpointId, touchpointIds), gte(salesCalls.scheduledAt, periodStartDate), lte(salesCalls.scheduledAt, periodEndDate))),
        db
          .select({ id: sales.id, totalPrice: sales.totalPrice })
          .from(sales)
          .where(and(eq(sales.userId, accountId), inArray(sales.metaTouchpointId, touchpointIds), gte(sales.saleDate, dashboard.period.start), lte(sales.saleDate, dashboard.period.end))),
      ])
    : [[], [], []] as const;
  const allSalesInPeriod = await db
    .select({ id: sales.id, metaTouchpointId: sales.metaTouchpointId })
    .from(sales)
    .where(and(eq(sales.userId, accountId), gte(sales.saleDate, dashboard.period.start), lte(sales.saleDate, dashboard.period.end)));
  const revenueCentsRaw = saleRows.reduce((total, sale) => total + sale.totalPrice * 100, 0);
  const coverageRate = selectedCampaign.cash?.coverageRate ?? null;
  const unattributedSalesInPeriod = countUnattributedMetaSales(allSalesInPeriod, knownTouchpointIds);
  const cashAttributionReady = saleRows.length > 0 && coverageRate !== null && coverageRate >= META_MIN_CASH_ATTRIBUTION_COVERAGE;
  const levelCoverage = {
    ad: touchpointIds.length > 0 ? levels.ad / touchpointIds.length : null,
    adset: touchpointIds.length > 0 ? levels.adset / touchpointIds.length : null,
    campaign: touchpointIds.length > 0 ? levels.campaign / touchpointIds.length : null,
    utm_seul: touchpointIds.length > 0 ? levels.utm_seul / touchpointIds.length : null,
  };
  const attributionQuality = {
    status: cashAttributionReady ? "verified" as const : touchpointIds.length > 0 && (leadRows.length > 0 || callRows.length > 0) ? "partial" as const : "unavailable" as const,
    touchpoints: touchpointIds.length,
    levels,
    levelCoverage,
    leads: leadRows.length,
    bookedCalls: callRows.length,
    closedCalls: callRows.filter((call) => call.outcome === "closed").length,
    sales: saleRows.length,
    revenueCents: cashAttributionReady ? revenueCentsRaw : null,
    salesInPeriod: allSalesInPeriod.length,
    unattributedSalesInPeriod,
    coverageRate,
  };

  const actionEntityIds = [
    campaignRow.campaign.externalId,
    ...adSetRows.map((row) => row.externalId),
    ...adRows.map((row) => row.externalId),
  ];
  const actionLogRows = await db
    .select({
      id: metaAdActionLogs.id,
      entityType: metaAdActionLogs.entityType,
      entityExternalId: metaAdActionLogs.entityExternalId,
      actionType: metaAdActionLogs.actionType,
      status: metaAdActionLogs.status,
      requestedState: metaAdActionLogs.requestedState,
      resultState: metaAdActionLogs.resultState,
      errorMessage: metaAdActionLogs.errorMessage,
      createdAt: metaAdActionLogs.createdAt,
    })
    .from(metaAdActionLogs)
    .where(and(eq(metaAdActionLogs.userId, accountId), eq(metaAdActionLogs.adAccountId, dashboard.account.id), inArray(metaAdActionLogs.entityExternalId, actionEntityIds)))
    .orderBy(desc(metaAdActionLogs.createdAt))
    .limit(50);

  const daily = metricRows
    .filter((row) => row.level === "campaign")
    .map((row) => ({
      date: row.date,
      spendCents: row.availableMetrics.includes("spend") ? row.spendCents : null,
      impressions: row.availableMetrics.includes("impressions") ? row.impressions : null,
      linkClicks: row.availableMetrics.includes("inline_link_clicks") ? row.linkClicks : null,
      leads: row.availableMetrics.includes("meta_action:leads") ? row.leads : null,
      video3sViews: row.availableMetrics.includes("video_3_sec_watched_actions") ? row.video3sViews : null,
      videoThruplay: row.availableMetrics.includes("video_thruplay_watched_actions") ? row.videoThruplay : null,
    }));
  const byAdSet = new Map<string, MetaMetricTotals>();
  const byAd = new Map<string, MetaMetricTotals>();
  const byPlacement = new Map<string, { publisherPlatform: string; platformPosition: string; metrics: MetaMetricTotals }>();
  for (const row of metricRows) {
    if (row.level === "adset" && row.adSetExternalId) {
      const aggregate = byAdSet.get(row.adSetExternalId) ?? emptyTotals();
      addTotals(aggregate, row);
      byAdSet.set(row.adSetExternalId, aggregate);
    }
    if (row.level === "ad" && row.adExternalId) {
      const aggregate = byAd.get(row.adExternalId) ?? emptyTotals();
      addTotals(aggregate, row);
      byAd.set(row.adExternalId, aggregate);
    }
  }
  for (const row of placementRows) {
    const publisherPlatform = rawString(row.raw, "publisher_platform") ?? "Inconnu";
    const platformPosition = rawString(row.raw, "platform_position") ?? "Inconnu";
    const key = `${publisherPlatform}:${platformPosition}`;
    const aggregate = byPlacement.get(key) ?? { publisherPlatform, platformPosition, metrics: emptyTotals() };
    addTotals(aggregate.metrics, row);
    byPlacement.set(key, aggregate);
  }

  return {
    dashboard,
    campaign: {
      ...selectedCampaign,
      landingPageUrl: campaignRow.campaign.landingPageUrl,
      dailyBudgetCents: campaignRow.campaign.dailyBudgetCents,
      lifetimeBudgetCents: campaignRow.campaign.lifetimeBudgetCents,
    },
    daily,
    adSets: adSetRows.map((row) => ({ id: row.id, externalId: row.externalId, name: row.name, status: row.effectiveStatus ?? row.status, deepLink: metaAdsManagerUrl(dashboard.account.externalId, campaignRow.campaign.externalId, row.externalId), metrics: byAdSet.get(row.externalId) ?? emptyTotals() })),
    ads: adRows.map((row) => ({ id: row.id, externalId: row.externalId, name: row.name, status: row.effectiveStatus ?? row.status, creativeName: row.creativeName, thumbnailUrl: row.thumbnailUrl, deepLink: metaAdsManagerUrl(dashboard.account.externalId, campaignRow.campaign.externalId, adSetRows.find((adSet) => adSet.id === row.adSetId)?.externalId, row.externalId), metrics: byAd.get(row.externalId) ?? emptyTotals() })),
    placements: Array.from(byPlacement.values()).map((row) => ({
      publisherPlatform: row.publisherPlatform,
      platformPosition: row.platformPosition,
      deepLink: metaAdsManagerUrl(dashboard.account.externalId, campaignRow.campaign.externalId),
      metrics: row.metrics,
    })),
    audiences: adSetRows.map((row) => {
      const included = targetingLabels(row.targeting, "custom_audiences");
      const excluded = targetingLabels(row.targeting, "excluded_custom_audiences");
      const metrics = byAdSet.get(row.externalId) ?? emptyTotals();
      const spendCents = metricValue(metrics, "spendCents");
      const leads = metricValue(metrics, "leads");
      return {
        adSetId: row.id,
        adSetName: row.name,
        deepLink: metaAdsManagerUrl(dashboard.account.externalId, campaignRow.campaign.externalId, row.externalId),
        active: (row.effectiveStatus ?? row.status) === "ACTIVE",
        included,
        excluded,
        windowDays: audienceWindowDays(included),
        spendCents,
        leads,
        cpaCents: spendCents !== null && leads !== null && leads > 0 ? spendCents / leads : null,
        targetingAvailable: row.targeting !== null,
      };
    }),
    attributionQuality,
    // Insights are materialized per campaign type and period. A campaign can
    // be manually reclassified after the last sync, so do not show a stale
    // rule from the previous type or a different period while the next
    // materialization is pending.
    insights: insightRows.filter((row) => {
      const snapshot = row.snapshot;
      return (
        typeof snapshot === "object" &&
        snapshot !== null &&
        !Array.isArray(snapshot) &&
        snapshot.campaignType === selectedCampaign.campaignType &&
        snapshot.periodStart === dashboard.period.start &&
        snapshot.periodEnd === dashboard.period.end
      );
    }),
    actionLogs: actionLogRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
  };
}
