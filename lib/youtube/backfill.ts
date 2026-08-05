import { eq } from "drizzle-orm";

import { db } from "@/db";
import { contentPosts, youtubeVideoInsights } from "@/db/schema";

import { fetchVideoAnalytics, fetchVideoDurations, listUploadedVideos } from "./client";
import { normalizeVideo } from "./events";
import { YOUTUBE_BACKFILL_TIME_BUDGET_MS } from "./protocol";

export type BackfillResult = { processed: number; skipped: number; completed: boolean };

async function knownVideoIds(userId: string): Promise<Set<string>> {
  const rows = await db.select({ videoId: youtubeVideoInsights.videoId }).from(youtubeVideoInsights).where(eq(youtubeVideoInsights.userId, userId));
  return new Set(rows.map((row) => row.videoId));
}

// Core YouTube -> Scale X sync, shared by the Inngest connect-job and the
// recurring insights-refresh cron. Like Instagram's backfillInstagramPosts,
// always upserts (watch-time/retention numbers keep evolving after
// publish), fully idempotent. `channelPublishedAt`/`uploadsPlaylistId` are
// resolved by the caller via lib/youtube/client.ts's fetchChannel (which
// also refreshes the connection's subscriberCount/viewCountTotal snapshot —
// see the Inngest functions and Server Actions that call this).
//
// `sinceDate` restricts which ALREADY-SEEN videos get their analytics
// refetched (recurring cron / manual refresh only re-poll recently
// published videos — see protocol.ts's YOUTUBE_INSIGHTS_REFRESH_WINDOW_DAYS);
// omit it for the full connect-time backfill. `sinceDate` NEVER excludes a
// video this user has never been synced before, regardless of its age —
// same rule as Instagram's backfillInstagramPosts, so a video that failed to
// sync once is recoverable by the next cron run, not just a full
// disconnect+reconnect.
export async function backfillYoutubeVideos(
  userId: string,
  accessToken: string,
  uploadsPlaylistId: string,
  channelPublishedAt: string,
  sinceDate?: Date
): Promise<BackfillResult> {
  const [videos, existingVideoIds] = await Promise.all([listUploadedVideos(accessToken, uploadsPlaylistId), knownVideoIds(userId)]);
  const scoped = sinceDate ? videos.filter((item) => new Date(item.publishedAt) >= sinceDate || !existingVideoIds.has(item.id)) : videos;
  if (scoped.length === 0) return { processed: 0, skipped: 0, completed: true };

  // Analytics + duration are fetched in batches up-front (not per item like
  // Instagram) — see protocol.ts's YOUTUBE_ANALYTICS_BATCH_SIZE, the
  // deliberate architectural difference this API surface allows.
  const videoIds = scoped.map((video) => video.id);
  const [analytics, durations] = await Promise.all([
    fetchVideoAnalytics(accessToken, videoIds, channelPublishedAt),
    fetchVideoDurations(accessToken, videoIds),
  ]);

  const startedAt = Date.now();
  let processed = 0;
  let skipped = 0;
  let completed = true;
  for (const [index, item] of scoped.entries()) {
    // The network calls above already happened; this loop is DB writes only
    // — still budget-guarded for a pathologically large never-synced
    // channel, same recovery pattern as Instagram (`completed: false` lets
    // the caller schedule a follow-up run instead of the function dying
    // mid-write).
    if (Date.now() - startedAt > YOUTUBE_BACKFILL_TIME_BUDGET_MS) {
      completed = false;
      console.error(`[youtube] backfill for user ${userId}: time budget reached, ${scoped.length - index} item(s) deferred to a follow-up run`);
      break;
    }
    try {
      const normalized = normalizeVideo(item, analytics.get(item.id) ?? {}, durations.get(item.id) ?? null);
      await processNormalizedVideo(userId, normalized);
      processed += 1;
    } catch (error) {
      skipped += 1;
      console.error(`[youtube] skipping video ${item.id} after a sync error`, error);
    }
  }

  if (skipped > 0) {
    console.error(`[youtube] backfill for user ${userId}: ${processed} processed, ${skipped} skipped after errors`);
  }

  return { processed, skipped, completed };
}

async function processNormalizedVideo(userId: string, normalized: ReturnType<typeof normalizeVideo>): Promise<void> {
  const raw = { ...normalized.insights, views: normalized.views, durationSeconds: normalized.durationSeconds };

  await db
    .insert(youtubeVideoInsights)
    .values({
      userId,
      videoId: normalized.videoId,
      title: normalized.title,
      thumbnailUrl: normalized.thumbnailUrl,
      durationSeconds: normalized.durationSeconds,
      publishedAt: normalized.publishedAt,
      views: normalized.views,
      likes: normalized.insights.likes,
      comments: normalized.insights.comments,
      shares: normalized.insights.shares,
      estimatedMinutesWatched: normalized.insights.estimatedMinutesWatched,
      averageViewDurationSeconds: normalized.insights.averageViewDurationSeconds,
      averageViewPercentage: normalized.insights.averageViewPercentage,
      subscribersGained: normalized.insights.subscribersGained,
      subscribersLost: normalized.insights.subscribersLost,
      rawInsights: raw,
      lastFetchedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [youtubeVideoInsights.userId, youtubeVideoInsights.videoId],
      set: {
        title: normalized.title,
        thumbnailUrl: normalized.thumbnailUrl,
        durationSeconds: normalized.durationSeconds,
        views: normalized.views,
        likes: normalized.insights.likes,
        comments: normalized.insights.comments,
        shares: normalized.insights.shares,
        estimatedMinutesWatched: normalized.insights.estimatedMinutesWatched,
        averageViewDurationSeconds: normalized.insights.averageViewDurationSeconds,
        averageViewPercentage: normalized.insights.averageViewPercentage,
        subscribersGained: normalized.insights.subscribersGained,
        subscribersLost: normalized.insights.subscribersLost,
        rawInsights: raw,
        lastFetchedAt: new Date(),
      },
    });

  // Projection into content_posts for the shared aggregate tiles at the top
  // of /acquisition/contenu — clicks always null (see protocol.ts's
  // YOUTUBE_ORGANIC_CLICKS_AVAILABLE). Never touches source="manual" or
  // source="instagram" rows (different externalId space entirely).
  await db
    .insert(contentPosts)
    .values({
      userId,
      platform: "YouTube",
      type: "video",
      title: normalized.title,
      publishedAt: normalized.publishedAt.toISOString().slice(0, 10),
      url: `https://www.youtube.com/watch?v=${normalized.videoId}`,
      views: normalized.views,
      likes: normalized.insights.likes,
      comments: normalized.insights.comments,
      shares: normalized.insights.shares,
      clicks: null,
      leads: null,
      source: "youtube",
      externalId: normalized.videoId,
    })
    .onConflictDoUpdate({
      target: [contentPosts.userId, contentPosts.source, contentPosts.externalId],
      set: {
        title: normalized.title,
        views: normalized.views,
        likes: normalized.insights.likes,
        comments: normalized.insights.comments,
        shares: normalized.insights.shares,
      },
    });
}

// Recent-video scope used by the recurring cron — see protocol.ts's
// YOUTUBE_INSIGHTS_REFRESH_WINDOW_DAYS.
export function insightsRefreshSinceDate(windowDays: number): Date {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  return since;
}
