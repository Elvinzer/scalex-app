import { notFound } from "next/navigation";

import { MetaAdsConnectionCard } from "@/components/meta-ads/meta-ads-connection-card";
import { MetaAdsDashboard } from "@/components/meta-ads/meta-ads-dashboard";
import type { MetaAdsDashboard as MetaAdsDashboardData, MetaCampaignDashboardRow, MetaMetricKey, MetaMetricTotals } from "@/lib/meta-ads/queries";
import type { MetaCampaignType } from "@/lib/meta-ads/types";

const ALL_METRICS: MetaMetricKey[] = [
  "spendCents",
  "impressions",
  "reach",
  "clicks",
  "linkClicks",
  "leads",
  "landingPageViews",
  "video3sViews",
  "videoThruplay",
  "profileVisits",
  "follows",
  "registrations",
  "purchases",
  "purchaseValueCents",
  "messages",
];

const FIXTURE_NOW = "2026-08-08";
const FIXTURE_SYNCED_AT = "2026-08-08T08:00:00.000Z";

function metrics(overrides: Partial<Omit<MetaMetricTotals, "available">>): MetaMetricTotals {
  const values: Omit<MetaMetricTotals, "available"> = {
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
    ...overrides,
  };

  return {
    ...values,
    available: Object.fromEntries(ALL_METRICS.map((key) => [key, true])) as Record<MetaMetricKey, boolean>,
  };
}

function campaign(
  id: string,
  name: string,
  campaignType: MetaCampaignType,
  campaignMetrics: MetaMetricTotals,
  targetCpaCents: number | null,
): MetaCampaignDashboardRow {
  return {
    id,
    externalId: `fixture-${id}`,
    name,
    objective: campaignType === "instagram_profile_growth" ? "OUTCOME_ENGAGEMENT" : "OUTCOME_LEADS",
    effectiveStatus: "ACTIVE",
    campaignType,
    typeSource: "manual",
    targets: { targetCpaCents, targetRoas: 3, leadValueCents: 12_000 },
    metrics: campaignMetrics,
    comparisonMetrics: metrics({
      spendCents: Math.round(campaignMetrics.spendCents * 0.86),
      impressions: Math.round(campaignMetrics.impressions * 0.82),
      reach: Math.round(campaignMetrics.reach * 0.84),
      clicks: Math.round(campaignMetrics.clicks * 0.9),
      linkClicks: Math.round(campaignMetrics.linkClicks * 0.9),
      leads: Math.max(1, Math.round(campaignMetrics.leads * 0.8)),
      purchases: Math.max(0, Math.round(campaignMetrics.purchases * 0.75)),
      purchaseValueCents: Math.round(campaignMetrics.purchaseValueCents * 0.75),
    }),
    metricCoverageRate: 1,
    comparisonMetricCoverageRate: 0.97,
    retargetingAudiences: [],
    instagramObservation: {
      connected: true,
      current: { follows: campaignType === "instagram_profile_growth" ? 37 : 12, interactions: 184, engagementPerFollower: 4.97 },
      comparison: { follows: 28, interactions: 176, engagementPerFollower: 6.28 },
    },
    cash: {
      revenueCents: 48_000,
      sales: 4,
      available: true,
      comparisonRevenueCents: 36_000,
      comparisonSales: 3,
      comparisonAvailable: true,
      coverageRate: 0.8,
      comparisonCoverageRate: 0.75,
    },
    latestDate: FIXTURE_NOW,
  };
}

function buildDashboard(): MetaAdsDashboardData {
  const campaigns = [
    campaign("11111111-1111-4111-8111-111111111111", "VSL — Angle douleur principale", "vsl", metrics({ spendCents: 186_000, impressions: 48_200, reach: 31_400, clicks: 2_100, linkClicks: 1_460, leads: 64, landingPageViews: 1_110, video3sViews: 18_500, videoThruplay: 7_100, purchases: 4, purchaseValueCents: 48_000 }), 3_500),
    campaign("22222222-2222-4222-8222-222222222222", "Webinaire — Session août", "webinar", metrics({ spendCents: 124_000, impressions: 32_800, reach: 23_200, clicks: 1_260, linkClicks: 920, leads: 48, registrations: 42, purchases: 2, purchaseValueCents: 24_000 }), 2_800),
    campaign("33333333-3333-4333-8333-333333333333", "Profil Instagram — Preuve sociale", "instagram_profile_growth", metrics({ spendCents: 72_000, impressions: 21_400, reach: 14_900, clicks: 860, linkClicks: 540, profileVisits: 390, follows: 0 }), null),
    campaign("44444444-4444-4444-8444-444444444444", "Retargeting — 30 jours", "retargeting", metrics({ spendCents: 98_000, impressions: 15_600, reach: 4_200, clicks: 740, linkClicks: 510, leads: 31, purchases: 3, purchaseValueCents: 36_000 }), 3_200),
  ];

  const totals = metrics({
    spendCents: campaigns.reduce((total, row) => total + row.metrics.spendCents, 0),
    impressions: campaigns.reduce((total, row) => total + row.metrics.impressions, 0),
    reach: campaigns.reduce((total, row) => total + row.metrics.reach, 0),
    clicks: campaigns.reduce((total, row) => total + row.metrics.clicks, 0),
    linkClicks: campaigns.reduce((total, row) => total + row.metrics.linkClicks, 0),
    leads: campaigns.reduce((total, row) => total + row.metrics.leads, 0),
    registrations: campaigns.reduce((total, row) => total + row.metrics.registrations, 0),
    profileVisits: campaigns.reduce((total, row) => total + row.metrics.profileVisits, 0),
    purchases: campaigns.reduce((total, row) => total + row.metrics.purchases, 0),
    purchaseValueCents: campaigns.reduce((total, row) => total + row.metrics.purchaseValueCents, 0),
    video3sViews: campaigns.reduce((total, row) => total + row.metrics.video3sViews, 0),
    videoThruplay: campaigns.reduce((total, row) => total + row.metrics.videoThruplay, 0),
  });

  return {
    connected: true,
    account: { id: "fixture-account", externalId: "act_1234567890", name: "Scale X Fixture Ads", currency: "EUR", timezone: "Europe/Paris" },
    connection: { status: "connected", initialSyncStatus: "completed", lastSyncCompletedAt: FIXTURE_SYNCED_AT, lastSyncError: null, grantedScopes: ["ads_read"] },
    period: { start: "2026-07-10", end: FIXTURE_NOW, days: 30, consolidatedThrough: "2026-08-06" },
    comparisonPeriod: { start: "2026-06-10", end: "2026-07-09" },
    frequencySaturationThreshold: 3,
    missingMetricDates: ["2026-07-17"],
    totals,
    comparisonTotals: metrics({
      spendCents: Math.round(totals.spendCents * 0.84),
      impressions: Math.round(totals.impressions * 0.8),
      reach: Math.round(totals.reach * 0.82),
      clicks: Math.round(totals.clicks * 0.86),
      linkClicks: Math.round(totals.linkClicks * 0.86),
      leads: Math.round(totals.leads * 0.77),
      registrations: Math.round(totals.registrations * 0.75),
      profileVisits: Math.round(totals.profileVisits * 0.8),
      purchases: Math.round(totals.purchases * 0.7),
      purchaseValueCents: Math.round(totals.purchaseValueCents * 0.7),
    }),
    corrections: [{
      id: "55555555-5555-4555-8555-555555555555",
      date: "2026-07-22",
      level: "campaign",
      entityKey: "campaign:fixture-11111111-1111-4111-8111-111111111111",
      reason: "Meta a révisé les actions après consolidation.",
      beforeSnapshot: { spendCents: 18_000, leads: null },
      afterSnapshot: { spendCents: 18_500, leads: 6 },
      createdAt: FIXTURE_SYNCED_AT,
    }],
    instagramObservation: { connected: true, current: { follows: 49, interactions: 680, engagementPerFollower: 13.88 }, comparison: { follows: 38, interactions: 624, engagementPerFollower: 16.42 } },
    campaigns,
  };
}

export default function MetaAdsE2EFixturePage() {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <main className="min-h-screen overflow-x-clip bg-panel px-4 py-8 md:px-16">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div>
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Fixture locale uniquement · Meta Ads</p>
          <h1 className="mt-1 text-3xl font-bold">Meta Ads — fixture responsive</h1>
          <p className="mt-1 text-sm text-muted-foreground">Données synthétiques pour vérifier les états UI, les tableaux scrollables et les alternatives accessibles.</p>
        </div>

        <MetaAdsConnectionCard
          connected
          connectionStatus="connected"
          metaUserName="Scale X Fixture"
          selectedAdAccountId="act_1234567890"
          initialSyncStatus="completed"
          initialSyncCompletedAt={new Date(FIXTURE_SYNCED_AT)}
          lastSyncCompletedAt={new Date(FIXTURE_SYNCED_AT)}
          grantedScopes={["ads_read"]}
          accounts={[{ externalId: "act_1234567890", name: "Scale X Fixture Ads", currency: "EUR", timezone: "Europe/Paris", canRead: true }, { externalId: "act_0987654321", name: "Compte sans accès", currency: "USD", timezone: "America/New_York", canRead: false, disableReason: "Accès lecture absent" }]}
          subscriptionActive
          connectionNotice={null}
        />

        <MetaAdsDashboard data={buildDashboard()} />
      </div>
    </main>
  );
}
