import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { z } from "zod";

import { db } from "@/db";
import { youtubeCardMetrics, youtubeConnections, youtubeEndScreenMetrics } from "@/db/schema";
import { getContentPosts } from "@/lib/content-posts/queries";
import { computeReliability, getVideoAttributionTotals } from "@/lib/youtube/attribution";
import { computeVideoMetricComparisons } from "@/lib/youtube/insights-comparison";
import { getYoutubeVideoInsight, getYoutubeVideoInsightsMap, getYoutubeVideoSnapshots, getYoutubeVideoSnapshotsMap } from "@/lib/youtube/queries";
import { retentionAtSeconds } from "@/lib/youtube/retention";
import { bookingsPerThousandViews, revenuePerThousandViews, subscribersPerThousandViews } from "@/lib/youtube/rates";
import { velocityBenchmark } from "@/lib/youtube/velocity";
import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { YoutubeVideoDetailPage } from "./youtube-video-detail-page";

export const dynamic = "force-dynamic";

const videoIdSchema = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/u);

export default async function YoutubeVideoPage({ params }: { params: Promise<{ videoId: string }> }) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "acquisition:contenu");
  const { videoId } = await params;
  if (!videoIdSchema.safeParse(videoId).success) notFound();

  const [video, snapshots, allInsights, [connection], posts, attributionTotals, endScreenMetrics, cardMetrics] = await Promise.all([
    getYoutubeVideoInsight(accountId, videoId),
    getYoutubeVideoSnapshots(accountId, videoId),
    getYoutubeVideoInsightsMap(accountId),
    db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, accountId)).limit(1),
    getContentPosts(accountId),
    getVideoAttributionTotals(accountId),
    db.select().from(youtubeEndScreenMetrics).where(and(eq(youtubeEndScreenMetrics.userId, accountId), eq(youtubeEndScreenMetrics.videoId, videoId))).orderBy(asc(youtubeEndScreenMetrics.capturedOn)),
    db.select().from(youtubeCardMetrics).where(and(eq(youtubeCardMetrics.userId, accountId), eq(youtubeCardMetrics.videoId, videoId))).orderBy(asc(youtubeCardMetrics.capturedOn)),
  ]);
  if (!video || (video.privacyStatus !== null && video.privacyStatus !== "public")) notFound();

  const videos = Array.from(allInsights.values());
  const snapshotsByVideo = await getYoutubeVideoSnapshotsMap(accountId);
  const post = posts.find((candidate) => candidate.source === "youtube" && candidate.externalId === video.videoId);
  const attribution = attributionTotals.get(video.videoId) ?? null;
  const reliability = computeReliability(attributionTotals);
  const revenueVisible = reliability.canShowEuros && attribution !== null;
  const commercial = {
    bookings: post?.bookings ?? null,
    dealsClosed: post?.dealsClosed ?? null,
    declaredSales: attribution?.declaredSales ?? 0,
    estimatedSales: attribution?.estimatedSales ?? 0,
    declaredRevenueEur: revenueVisible ? attribution?.declaredRevenueEur ?? null : null,
    estimatedRevenueEur: revenueVisible ? attribution?.estimatedRevenueEur ?? null : null,
    revenueEur: revenueVisible && attribution ? attribution.declaredRevenueEur + attribution.estimatedRevenueEur : null,
    canShowEuros: reliability.canShowEuros,
  };
  const comparableValues = {
    views: new Map(videos.map((row) => [row.videoId, row.views])),
    retention: new Map(videos.map((row) => [row.videoId, row.averageViewPercentage])),
    retention30: new Map(videos.map((row) => [row.videoId, row.views !== null && row.views >= 100 ? retentionAtSeconds(row, 30) : null])),
    bookingsPer1000: new Map(videos.map((row) => {
      const contentPost = posts.find((candidate) => candidate.source === "youtube" && candidate.externalId === row.videoId);
      return [row.videoId, bookingsPerThousandViews(contentPost?.bookings ?? null, row.views)];
    })),
    revenuePer1000: new Map(videos.map((row) => {
      const rowAttribution = attributionTotals.get(row.videoId);
      const rowRevenue = reliability.canShowEuros && rowAttribution ? rowAttribution.declaredRevenueEur + rowAttribution.estimatedRevenueEur : null;
      return [row.videoId, revenuePerThousandViews(rowRevenue, row.views)];
    })),
    subsPer1000: new Map(videos.map((row) => [row.videoId, subscribersPerThousandViews(row)])),
  };
  const comparison = {
    views: computeVideoMetricComparisons(videos, comparableValues.views).get(video.videoId) ?? null,
    retention: computeVideoMetricComparisons(videos, comparableValues.retention).get(video.videoId) ?? null,
    retention30: computeVideoMetricComparisons(videos, comparableValues.retention30).get(video.videoId) ?? null,
    bookingsPer1000: computeVideoMetricComparisons(videos, comparableValues.bookingsPer1000).get(video.videoId) ?? null,
    revenuePer1000: computeVideoMetricComparisons(videos, comparableValues.revenuePer1000).get(video.videoId) ?? null,
    subsPer1000: computeVideoMetricComparisons(videos, comparableValues.subsPer1000).get(video.videoId) ?? null,
  };
  const velocity = {
    benchmarkDay7: velocityBenchmark(video, videos, snapshotsByVideo, 7),
  };
  const locale = await getLocale();

  return (
    <YoutubeVideoDetailPage
      video={video}
      snapshots={snapshots}
      commercial={commercial}
      comparison={comparison}
      velocity={velocity}
      endScreenMetrics={endScreenMetrics}
      cardMetrics={cardMetrics}
      locale={locale}
      lastSyncAt={connection?.lastAnalyticsSyncAt ?? null}
      reportingSyncStatus={connection?.reportingSyncStatus ?? null}
    />
  );
}
