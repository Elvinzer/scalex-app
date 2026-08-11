import { cache } from "react";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { closingKpiEntries, emailCampaigns, leadStageHistory, leads, metaAdMetricsDaily, nativeBookingLeads, settingKpiEntries } from "@/db/schema";
import { getAllMonthlyMetrics, getMonthlyCallSources, getSalesCallKpiRecords } from "@/lib/monthly-metrics/queries";
import { getLeads } from "@/lib/leads/queries";
import { getSales } from "@/lib/sales/queries";
import { getContentPosts } from "@/lib/content-posts/queries";
import { getVideoAttributionTotals } from "@/lib/youtube/attribution";
import { getInstagramPostInsightsMap } from "@/lib/instagram/queries";
import { getYoutubeVideoInsightsMap } from "@/lib/youtube/queries";

// Memoized per accountId for the lifetime of a single request — same
// pattern as lib/team/context.ts's getAccountContext (and now
// getBusinessProfile/getDiagnosticBenchmarks, wrapped the same way at their
// own definitions). app/(app)/layout.tsx (Scale Score badge, mounted on
// every page) and the page itself (Dashboard, Diagnostic, Overview,
// Copilote, Ads) were each independently re-running these same source reads;
// this collapses that into one batch per request. Downstream math
// (aggregatePeriodTotals, computeDiagnosticPoints, computeScaleScore...)
// still runs separately per caller — it's pure and cheap, only the DB reads
// were worth deduping.
export const getDiagnosticKpiRawData = cache(async (accountId: string) => {
  const [allSettingEntries, allClosingEntries, allMonthlyRows, allCallSourcesByMonth, allCallRecords, allSales, allLeads, allLeadStageHistory, youtubeInsightsMap, instagramInsightsMap, allContentPosts, allVideoAttributionTotals, allEmailCampaigns, allMetaMetrics, allNativeBookingLeads] = await Promise.all([
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, accountId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, accountId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(accountId),
    getMonthlyCallSources(accountId),
    getSalesCallKpiRecords(accountId),
    getSales(accountId),
    getLeads(accountId),
    db
      .select({ leadId: leadStageHistory.leadId, toStage: leadStageHistory.toStage, changedAt: leadStageHistory.changedAt })
      .from(leadStageHistory)
      .innerJoin(leads, eq(leadStageHistory.leadId, leads.id))
      .where(eq(leads.userId, accountId)),
    getYoutubeVideoInsightsMap(accountId),
    getInstagramPostInsightsMap(accountId),
    getContentPosts(accountId),
    getVideoAttributionTotals(accountId),
    db.select().from(emailCampaigns).where(eq(emailCampaigns.userId, accountId)),
    db.select().from(metaAdMetricsDaily).where(eq(metaAdMetricsDaily.userId, accountId)),
    db.select().from(nativeBookingLeads).where(eq(nativeBookingLeads.userId, accountId)),
  ]);
  return {
    allSettingEntries,
    allClosingEntries,
    allMonthlyRows,
    allCallSourcesByMonth,
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
