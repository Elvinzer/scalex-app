import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/db";
import { emailCampaigns, metaAdMetricsDaily, nativeBookingLeads, youtubeVideoInsights } from "@/db/schema";
import { diagnosticDataCacheTag } from "@/lib/diagnostic/cache-tags";
import { getClosingKpiEntries, getAllMonthlyMetrics, getSalesCallKpiRecords, getSettingKpiEntries } from "@/lib/monthly-metrics/queries";
import { aggregateSalesCallsByMonth } from "@/lib/monthly-metrics/call-source";
import { getLeadStageHistory, getLeads } from "@/lib/leads/queries";
import { getSales } from "@/lib/sales/queries";
import { getContentPosts } from "@/lib/content-posts/queries";
import { getVideoAttributionTotals } from "@/lib/youtube/attribution";
import { getInstagramPostInsightsMap } from "@/lib/instagram/queries";
import { getYoutubeVideoInsightsMap } from "@/lib/youtube/queries";
import { getInFlight } from "@/lib/perf/in-flight";
import { measureAsync } from "@/lib/perf/timing";

const DIAGNOSTIC_CACHE_REVALIDATE_SECONDS = 30;

// Each source has one loader and one cache identity, shared by the sidebar,
// pages and background revalidation. Keep SQL in flight after a caller times
// out: releasing it early would let the next navigation duplicate that work.
function diagnosticSource<T>(source: string, loader: (accountId: string) => Promise<T>) {
  const reads = new Map<string, Promise<T>>();
  const cacheReads = new Map<string, Promise<T>>();
  return cache((accountId: string) => getInFlight(cacheReads, accountId, () =>
    unstable_cache(
      () => getInFlight(reads, accountId, () => measureAsync(`db.diagnostic.${source}`, () => loader(accountId))),
      ["diagnostic-source-v2", source, accountId],
      { revalidate: DIAGNOSTIC_CACHE_REVALIDATE_SECONDS, tags: [diagnosticDataCacheTag(accountId)] }
    )(),
    { timeoutMs: 10_000, timeoutLabel: `diagnostic-${source}`, retainUntilSettled: true }
  ));
}

const sources = {
  setting: diagnosticSource("setting", getSettingKpiEntries),
  closing: diagnosticSource("closing", getClosingKpiEntries),
  monthly: diagnosticSource("monthly", getAllMonthlyMetrics),
  calls: diagnosticSource("call-records", getSalesCallKpiRecords),
  sales: diagnosticSource("sales", getSales),
  leads: diagnosticSource("leads", getLeads),
  history: diagnosticSource("lead-history", getLeadStageHistory),
  youtube: diagnosticSource("youtube", async (accountId) => Array.from((await getYoutubeVideoInsightsMap(accountId)).values())),
  instagram: diagnosticSource("instagram", async (accountId) => Array.from((await getInstagramPostInsightsMap(accountId)).values())),
  content: diagnosticSource("content", getContentPosts),
  youtubeVisibility: diagnosticSource("youtube-visibility", async (accountId) => db.select({
    videoId: youtubeVideoInsights.videoId,
    privacyStatus: youtubeVideoInsights.privacyStatus,
  }).from(youtubeVideoInsights).where(eq(youtubeVideoInsights.userId, accountId))),
  attribution: diagnosticSource("video-attribution", async (accountId) => Array.from((await getVideoAttributionTotals(accountId)).entries())),
  email: diagnosticSource("email", async (accountId) => db.select().from(emailCampaigns).where(eq(emailCampaigns.userId, accountId))),
  // Diagnostics only aggregate campaign totals. Raw API payloads and the
  // ad/adset breakdowns can exceed a megabyte even for a small account.
  meta: diagnosticSource("meta", async (accountId) => db.select({
    level: metaAdMetricsDaily.level,
    date: metaAdMetricsDaily.date,
    spendCents: metaAdMetricsDaily.spendCents,
    impressions: metaAdMetricsDaily.impressions,
    linkClicks: metaAdMetricsDaily.linkClicks,
    leads: metaAdMetricsDaily.leads,
    registrations: metaAdMetricsDaily.registrations,
    purchases: metaAdMetricsDaily.purchases,
    purchaseValueCents: metaAdMetricsDaily.purchaseValueCents,
  }).from(metaAdMetricsDaily).where(and(eq(metaAdMetricsDaily.userId, accountId), eq(metaAdMetricsDaily.level, "campaign")))),
  native: diagnosticSource("native-booking", async (accountId) => db.select({
    createdAt: nativeBookingLeads.createdAt,
    status: nativeBookingLeads.status,
  }).from(nativeBookingLeads).where(eq(nativeBookingLeads.userId, accountId))),
};

const fetchDiagnosticCore = cache(async (accountId: string) => {
  const [allSettingEntries, allClosingEntries, allMonthlyRows, allCallRecords, allSales, allLeads, allLeadStageHistory, allEmailCampaigns, allMetaMetrics, allNativeBookingLeads] = await Promise.all([
    sources.setting(accountId), sources.closing(accountId), sources.monthly(accountId), sources.calls(accountId),
    sources.sales(accountId), sources.leads(accountId), sources.history(accountId), sources.email(accountId),
    sources.meta(accountId), sources.native(accountId),
  ]);
  return {
    allSettingEntries, allClosingEntries, allMonthlyRows, allCallRecords, allSales, allLeads, allLeadStageHistory,
    allEmailCampaigns, allMetaMetrics, allNativeBookingLeads,
    allCallSourcesByMonth: aggregateSalesCallsByMonth(allCallRecords),
  };
});

async function fetchDiagnosticKpiRawData(accountId: string) {
  return measureAsync("db.diagnostic.raw", async () => {
    const [core, allYoutubeVideoInsights, allInstagramPostInsights, allContentPosts, allVideoAttributionTotals] = await Promise.all([
      fetchDiagnosticCore(accountId), sources.youtube(accountId), sources.instagram(accountId), sources.content(accountId), sources.attribution(accountId),
    ]);
    return { ...core, allYoutubeVideoInsights, allInstagramPostInsights, allContentPosts, allVideoAttributionTotals };
  });
}

type DiagnosticKpiRawData = Awaited<ReturnType<typeof fetchDiagnosticKpiRawData>>;

// React's cache() is scoped to one render/request. A sidebar and a page can
// still start the same snapshot at the same time from separate route
// requests. Share only the in-flight promise so concurrent requests do not fan
// out into the same 14-source snapshot. The entry is removed as soon as it
// settles, which avoids serving stale data after a mutation and keeps account
// data isolated by the accountId key.
const inFlightDiagnosticSnapshots = new Map<string, Promise<DiagnosticKpiRawData>>();

// The source-level cache already returns plain arrays for the two Maps. The
// request-level wrapper only shares the assembled value while it is in flight.
const getCachedDiagnosticKpiRawData = cache(async (accountId: string) =>
  getInFlight(inFlightDiagnosticSnapshots, accountId, () => fetchDiagnosticKpiRawData(accountId), {
    timeoutMs: 12_000,
    timeoutLabel: "diagnostic-kpi-raw",
    retainUntilSettled: true,
  })
);

type CachedDiagnosticKpiRawData = Awaited<ReturnType<typeof getCachedDiagnosticKpiRawData>>;

function restoreDate(value: Date | string): Date;
function restoreDate(value: Date | string | null): Date | null;
function restoreDate(value: Date | string | null): Date | null {
  return value === null ? null : value instanceof Date ? value : new Date(value);
}

function restoreDiagnosticDates(snapshot: CachedDiagnosticKpiRawData) {
  return {
    ...snapshot,
    allSettingEntries: snapshot.allSettingEntries.map((entry) => ({
      ...entry,
      createdAt: restoreDate(entry.createdAt),
      updatedAt: restoreDate(entry.updatedAt),
    })),
    allClosingEntries: snapshot.allClosingEntries.map((entry) => ({
      ...entry,
      createdAt: restoreDate(entry.createdAt),
      updatedAt: restoreDate(entry.updatedAt),
    })),
    allMonthlyRows: snapshot.allMonthlyRows.map((row) => ({
      ...row,
      cashCollectedSyncedAt: restoreDate(row.cashCollectedSyncedAt),
      newCustomersSyncedAt: restoreDate(row.newCustomersSyncedAt),
    })),
    allCallRecords: snapshot.allCallRecords.map((record) => ({
      ...record,
      scheduledAt: restoreDate(record.scheduledAt),
    })),
    allLeadStageHistory: snapshot.allLeadStageHistory.map((event) => ({
      ...event,
      changedAt: restoreDate(event.changedAt),
    })),
    allYoutubeVideoInsights: snapshot.allYoutubeVideoInsights.map((video) => ({
      ...video,
      publishedAt: restoreDate(video.publishedAt),
      deepInsightsFetchedAt: restoreDate(video.deepInsightsFetchedAt),
      lastFetchedAt: restoreDate(video.lastFetchedAt),
    })),
    allInstagramPostInsights: snapshot.allInstagramPostInsights.map((post) => ({
      ...post,
      mediaPublishedAt: restoreDate(post.mediaPublishedAt),
      lastFetchedAt: restoreDate(post.lastFetchedAt),
    })),
    allEmailCampaigns: snapshot.allEmailCampaigns.map((campaign) => ({
      ...campaign,
      createdAt: restoreDate(campaign.createdAt),
    })),
    allNativeBookingLeads: snapshot.allNativeBookingLeads.map((lead) => ({
      ...lead,
      createdAt: restoreDate(lead.createdAt),
    })),
    allVideoAttributionTotals: new Map(snapshot.allVideoAttributionTotals),
  };
}

export const getDiagnosticKpiRawData = cache(async (accountId: string) => {
  return restoreDiagnosticDates(await getCachedDiagnosticKpiRawData(accountId));
});

// Financial pages and the sidebar do not need social media insight payloads.
// The complete snapshot remains available for content-aware diagnostics.
export const getDiagnosticCoreData = cache(async (accountId: string) => {
  const core = await fetchDiagnosticCore(accountId);
  return restoreDiagnosticDates({
    ...core,
    allYoutubeVideoInsights: [], allInstagramPostInsights: [], allContentPosts: [], allVideoAttributionTotals: [],
  });
});

export const getDashboardDiagnosticData = cache(async (accountId: string) => {
  const [core, allYoutubeVideoInsights, allContentPosts, attribution] = await Promise.all([
    getDiagnosticCoreData(accountId), sources.youtubeVisibility(accountId), sources.content(accountId), sources.attribution(accountId),
  ]);
  return { ...core, allYoutubeVideoInsights, allContentPosts, allVideoAttributionTotals: new Map(attribution) };
});

