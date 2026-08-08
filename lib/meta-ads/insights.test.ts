import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/insight-execution/source-adapters", () => ({ upsertMaterializedInsight: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));

import { buildMetaAdsInsights, metaInsightFingerprint } from "./insights";
import type { MetaAdsDashboard, MetaMetricTotals } from "./queries";

function totals(overrides: Partial<MetaMetricTotals> = {}, availableOverrides: Partial<MetaMetricTotals["available"]> = {}): MetaMetricTotals {
  const available = Object.fromEntries(Object.keys({
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
  }).map((key) => [key, true])) as MetaMetricTotals["available"];
  return {
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
    available: { ...available, ...availableOverrides },
    ...overrides,
  };
}

function dashboard(campaign: MetaAdsDashboard["campaigns"][number]): MetaAdsDashboard {
  const campaignWithCoverage = {
    ...campaign,
    metricCoverageRate: campaign.metricCoverageRate ?? 1,
    comparisonMetricCoverageRate: campaign.comparisonMetricCoverageRate ?? 1,
  };
  return {
    connected: true,
    account: { id: "account", externalId: "act_1", name: "Test", currency: "EUR", timezone: "Europe/Paris" },
    connection: { status: "connected", initialSyncStatus: "completed", lastSyncCompletedAt: "2026-08-08T00:00:00.000Z", lastSyncError: null, grantedScopes: ["ads_read"] },
    period: { start: "2026-07-09", end: "2026-08-08", days: 30, consolidatedThrough: "2026-08-01" },
    comparisonPeriod: { start: "2026-06-09", end: "2026-07-08" },
    frequencySaturationThreshold: 3,
    missingMetricDates: [],
    totals: totals(),
    comparisonTotals: totals(),
    corrections: [],
    instagramObservation: {
      connected: false,
      current: { follows: null, interactions: null, engagementPerFollower: null },
      comparison: { follows: null, interactions: null, engagementPerFollower: null },
    },
    campaigns: [campaignWithCoverage],
  };
}

describe("Meta Ads insight catalogue", () => {
  it("fires the VSL retention rule with its evidence fields", () => {
    const data = dashboard({ id: "campaign", externalId: "c1", name: "VSL test", objective: "VIDEO_VIEWS", effectiveStatus: "ACTIVE", campaignType: "vsl", typeSource: "manual", metrics: totals({ impressions: 10_000, video3sViews: 3_000, videoThruplay: 300 }, { impressions: true, video3sViews: true, videoThruplay: true }), comparisonMetrics: totals({ impressions: 10_000, video3sViews: 2_500 }, { impressions: true, video3sViews: true }), latestDate: "2026-08-08" });
    const [insight] = buildMetaAdsInsights(data);
    expect(insight?.ruleKey).toBe("vsl_hook_ok_retention_faible");
    expect(insight?.evidence).toContain("30 %");
    expect(insight?.recommendedAction).toContain("Tester");
    expect(insight?.successCriterion).toContain("hold rate");
  });

  it("does not invent a webinar insight when attendance is unavailable", () => {
    const data = dashboard({ id: "campaign", externalId: "c1", name: "Webinar", objective: "LEAD_GENERATION", effectiveStatus: "ACTIVE", campaignType: "webinar", typeSource: "manual", metrics: totals({ impressions: 10_000, linkClicks: 500, registrations: 100 }, { impressions: true, linkClicks: true, registrations: true }), comparisonMetrics: totals(), latestDate: "2026-08-08" });
    expect(buildMetaAdsInsights(data)).toHaveLength(0);
  });

  it("freezes every rule when the synchronized day coverage is too low", () => {
    const data = dashboard({ id: "campaign", externalId: "c1", name: "VSL partial", objective: "VIDEO_VIEWS", effectiveStatus: "ACTIVE", campaignType: "vsl", typeSource: "manual", metricCoverageRate: 0.5, metrics: totals({ impressions: 10_000, video3sViews: 3_000, videoThruplay: 300 }, { impressions: true, video3sViews: true, videoThruplay: true }), comparisonMetrics: totals({ impressions: 10_000, video3sViews: 2_500 }, { impressions: true, video3sViews: true }), latestDate: "2026-08-08" });
    expect(buildMetaAdsInsights(data)).toHaveLength(0);
  });

  it("freezes historical rules when the comparison period is incomplete", () => {
    const data = dashboard({ id: "campaign", externalId: "c1", name: "VSL partial comparison", objective: "VIDEO_VIEWS", effectiveStatus: "ACTIVE", campaignType: "vsl", typeSource: "manual", comparisonMetricCoverageRate: 0.5, metrics: totals({ impressions: 10_000, video3sViews: 3_000, videoThruplay: 300 }, { impressions: true, video3sViews: true, videoThruplay: true }), comparisonMetrics: totals({ impressions: 10_000, video3sViews: 2_500 }, { impressions: true, video3sViews: true }), latestDate: "2026-08-08" });
    expect(buildMetaAdsInsights(data)).toHaveLength(0);
  });

  it("requires all three trend signals before declaring retargeting saturation", () => {
    const current = totals({ spendCents: 20_000, impressions: 10_000, reach: 2_000, linkClicks: 100, leads: 10 }, { spendCents: true, impressions: true, reach: true, linkClicks: true, leads: true });
    const previous = totals({ spendCents: 10_000, impressions: 5_000, reach: 2_000, linkClicks: 100, leads: 10 }, { spendCents: true, impressions: true, reach: true, linkClicks: true, leads: true });
    const data = dashboard({ id: "campaign", externalId: "c1", name: "Retargeting", objective: "CONVERSIONS", effectiveStatus: "ACTIVE", campaignType: "retargeting", typeSource: "manual", metrics: current, comparisonMetrics: previous, latestDate: "2026-08-08" });
    expect(buildMetaAdsInsights(data)).toHaveLength(1);
    expect(buildMetaAdsInsights(data)[0]?.ruleKey).toBe("rt_saturation");
    expect(buildMetaAdsInsights(data)[0]?.comparisonValue).toBe(2.5);
  });

  it("flags a buyer exclusion gap and an inefficient named retargeting window only with targeting evidence", () => {
    const data = dashboard({
      id: "campaign",
      externalId: "c1",
      name: "Retargeting",
      objective: "CONVERSIONS",
      effectiveStatus: "ACTIVE",
      campaignType: "retargeting",
      typeSource: "manual",
      metrics: totals({ impressions: 2_000 }, { impressions: true }),
      comparisonMetrics: totals(),
      retargetingAudiences: [
        {
          adSetId: "adset-buyers",
          adSetName: "Acheteurs 30 jours",
          active: true,
          included: ["Acheteurs 30 jours"],
          excluded: [],
          buyerAudienceDetected: true,
          buyerAudienceExcluded: false,
          windowDays: 30,
          spendCents: 5_000,
          leads: 10,
          cpaCents: 500,
          targetingAvailable: true,
        },
        {
          adSetId: "adset-prospects",
          adSetName: "Prospects 7 jours",
          active: true,
          included: ["Prospects 7 jours"],
          excluded: ["Acheteurs"],
          buyerAudienceDetected: false,
          buyerAudienceExcluded: true,
          windowDays: 7,
          spendCents: 1_000,
          leads: 10,
          cpaCents: 100,
          targetingAvailable: true,
        },
      ],
      latestDate: "2026-08-08",
    });
    const keys = buildMetaAdsInsights(data).map((insight) => insight.ruleKey);
    expect(keys).toContain("rt_exclusion_manquante");
    expect(keys).toContain("rt_fenetre_inefficace");
  });

  it("does not treat a missing Meta field as a zero", () => {
    const data = dashboard({ id: "campaign", externalId: "c1", name: "VSL", objective: "VIDEO_VIEWS", effectiveStatus: "ACTIVE", campaignType: "vsl", typeSource: "heuristic", metrics: totals({ impressions: 10_000, video3sViews: 3_000, videoThruplay: 300 }, { impressions: true, video3sViews: false, videoThruplay: false }), comparisonMetrics: totals(), latestDate: "2026-08-08" });
    expect(buildMetaAdsInsights(data)).toHaveLength(0);
  });

  it("changes fingerprint when the metric or period changes", () => {
    const data = dashboard({ id: "campaign", externalId: "c1", name: "VSL", objective: "VIDEO_VIEWS", effectiveStatus: "ACTIVE", campaignType: "vsl", typeSource: "manual", metrics: totals({ impressions: 10_000, video3sViews: 3_000, videoThruplay: 300 }, { impressions: true, video3sViews: true, videoThruplay: true }), comparisonMetrics: totals({ impressions: 10_000, video3sViews: 2_500 }, { impressions: true, video3sViews: true }), latestDate: "2026-08-08" });
    const [insight] = buildMetaAdsInsights(data);
    expect(insight).toBeDefined();
    expect(metaInsightFingerprint("account", insight!, "2026-07-09", "2026-08-08")).not.toBe(metaInsightFingerprint("account", insight!, "2026-06-09", "2026-07-08"));
  });
});
