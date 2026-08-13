import { cache } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { emailCampaigns, metaAdMetricsDaily, nativeBookingLeads } from "@/db/schema";
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

// The React `cache()` wrapper deduplicates calls inside one render. The
// snapshot intentionally stays out of Next's persistent Data Cache: it grows
// with an account's historical content and insight rows, and one cache entry
// can exceed Next's 2 MB limit. app/(app)/layout.tsx (Scale Score badge,
// mounted on every page) and the page itself (Dashboard, Diagnostic, Roadmap,
// Copilote, Ads) still share one source read during the request. Downstream
// math (aggregatePeriodTotals, computeDiagnosticPoints, computeScaleScore...)
// stays pure and cheap, so it is intentionally recomputed per projection.
async function fetchDiagnosticKpiRawData(accountId: string) {
  return measureAsync("db.diagnostic.raw", async () => {
    const [allSettingEntries, allClosingEntries, allMonthlyRows, allCallRecords, allSales, allLeads, allLeadStageHistory, youtubeInsightsMap, instagramInsightsMap, allContentPosts, allVideoAttributionTotals, allEmailCampaigns, allMetaMetrics, allNativeBookingLeads] = await Promise.all([
      measureAsync("db.diagnostic.setting", () => getSettingKpiEntries(accountId)),
      measureAsync("db.diagnostic.closing", () => getClosingKpiEntries(accountId)),
      measureAsync("db.diagnostic.monthly", () => getAllMonthlyMetrics(accountId)),
      measureAsync("db.diagnostic.call-records", () => getSalesCallKpiRecords(accountId)),
      measureAsync("db.diagnostic.sales", () => getSales(accountId)),
      measureAsync("db.diagnostic.leads", () => getLeads(accountId)),
      measureAsync("db.diagnostic.lead-history", () => getLeadStageHistory(accountId)),
      measureAsync("db.diagnostic.youtube", () => getYoutubeVideoInsightsMap(accountId)),
      measureAsync("db.diagnostic.instagram", () => getInstagramPostInsightsMap(accountId)),
      measureAsync("db.diagnostic.content", () => getContentPosts(accountId)),
      measureAsync("db.diagnostic.video-attribution", () => getVideoAttributionTotals(accountId)),
      measureAsync("db.diagnostic.email", () => db.select().from(emailCampaigns).where(eq(emailCampaigns.userId, accountId))),
      measureAsync("db.diagnostic.meta", () => db.select().from(metaAdMetricsDaily).where(eq(metaAdMetricsDaily.userId, accountId))),
      measureAsync("db.diagnostic.native-booking", () => db.select().from(nativeBookingLeads).where(eq(nativeBookingLeads.userId, accountId))),
    ]);
    return {
      allSettingEntries,
      allClosingEntries,
      allMonthlyRows,
      allCallSourcesByMonth: aggregateSalesCallsByMonth(allCallRecords),
      allCallRecords,
      allSales,
      allLeads,
      allLeadStageHistory,
      allYoutubeVideoInsights: Array.from(youtubeInsightsMap.values()),
      allInstagramPostInsights: Array.from(instagramInsightsMap.values()),
      allContentPosts,
      allVideoAttributionTotals,
      allEmailCampaigns,
      allMetaMetrics,
      allNativeBookingLeads,
    };
  });
}

type DiagnosticKpiRawData = Awaited<ReturnType<typeof fetchDiagnosticKpiRawData>>;

// React's cache() is scoped to one render/request. A sidebar and a page can
// still start the same large snapshot at the same time from separate route
// requests. Share only the in-flight promise so concurrent requests do not fan
// out into the same 14-query snapshot. The entry is removed as soon as it
// settles, which avoids serving stale data after a mutation and keeps account
// data isolated by the accountId key.
const inFlightDiagnosticSnapshots = new Map<string, Promise<DiagnosticKpiRawData>>();

// Keep the Map serializable inside the request-level memoized value. Unlike
// `unstable_cache`, React `cache()` does not persist this potentially large
// snapshot in Next's Data Cache.
const getCachedDiagnosticKpiRawData = cache(async (accountId: string) => {
  const snapshot = await getInFlight(inFlightDiagnosticSnapshots, accountId, () => fetchDiagnosticKpiRawData(accountId));
  return {
    ...snapshot,
    allVideoAttributionTotals: Array.from(snapshot.allVideoAttributionTotals.entries()),
  };
});

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
    allMetaMetrics: snapshot.allMetaMetrics.map((metric) => ({
      ...metric,
      consolidationUntil: restoreDate(metric.consolidationUntil),
      syncedAt: restoreDate(metric.syncedAt),
    })),
    allNativeBookingLeads: snapshot.allNativeBookingLeads.map((lead) => ({
      ...lead,
      selectedStartAt: restoreDate(lead.selectedStartAt),
      selectedEndAt: restoreDate(lead.selectedEndAt),
      contactConsentAt: restoreDate(lead.contactConsentAt),
      lastSeenAt: restoreDate(lead.lastSeenAt),
      contactedAt: restoreDate(lead.contactedAt),
      dismissedAt: restoreDate(lead.dismissedAt),
      convertedAt: restoreDate(lead.convertedAt),
      createdAt: restoreDate(lead.createdAt),
      updatedAt: restoreDate(lead.updatedAt),
    })),
    allVideoAttributionTotals: new Map(snapshot.allVideoAttributionTotals),
  };
}

export const getDiagnosticKpiRawData = cache(async (accountId: string) => {
  return restoreDiagnosticDates(await getCachedDiagnosticKpiRawData(accountId));
});

export type ScaleScoreInputs = {
  allSettingEntries: Awaited<ReturnType<typeof getSettingKpiEntries>>;
  allClosingEntries: Awaited<ReturnType<typeof getClosingKpiEntries>>;
  allMonthlyRows: Awaited<ReturnType<typeof getAllMonthlyMetrics>>;
};

async function fetchScaleScoreInputs(accountId: string): Promise<ScaleScoreInputs> {
  return measureAsync("db.scale-score.inputs", async () => {
    const [allSettingEntries, allClosingEntries, allMonthlyRows] = await Promise.all([
      measureAsync("db.scale-score.setting", () => getSettingKpiEntries(accountId)),
      measureAsync("db.scale-score.closing", () => getClosingKpiEntries(accountId)),
      measureAsync("db.scale-score.monthly", () => getAllMonthlyMetrics(accountId)),
    ]);

    return { allSettingEntries, allClosingEntries, allMonthlyRows };
  });
}

const inFlightScaleScoreInputs = new Map<string, Promise<ScaleScoreInputs>>();

export const getScaleScoreInputs = cache(async (accountId: string) => {
  return getInFlight(inFlightScaleScoreInputs, accountId, () => fetchScaleScoreInputs(accountId));
});
