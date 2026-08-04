import { db } from "@/db";
import { contentPosts, instagramPostInsights } from "@/db/schema";

import { fetchMediaInsights, listMedia } from "./client";
import { normalizeMedia } from "./events";

// Core Instagram -> Scale X sync, shared by the Inngest connect-job and the
// recurring insights-refresh cron. Unlike iClosed/Calendly's backfill
// (onConflictDoNothing — call data is finalized once written), this always
// upserts: organic insight numbers keep climbing for days after a post goes
// up, so a re-run must overwrite with fresher values, not skip. Still fully
// idempotent (safe to run repeatedly / replay on failure) — just via update
// instead of no-op on conflict.
//
// `sinceDate` restricts which media get their insights refetched (the
// recurring cron only wants recent posts — see protocol.ts's
// INSTAGRAM_INSIGHTS_REFRESH_WINDOW_DAYS); omit it for the full connect-time
// backfill.
export async function backfillInstagramPosts(userId: string, accessToken: string, sinceDate?: Date): Promise<number> {
  const media = await listMedia(accessToken);
  const scoped = sinceDate ? media.filter((item) => new Date(item.timestamp) >= sinceDate) : media;
  if (scoped.length === 0) return 0;

  let processed = 0;
  for (const item of scoped) {
    const { metrics, raw } = await fetchMediaInsights(accessToken, item.id, item.mediaType);
    const normalized = normalizeMedia(item, metrics);

    await db
      .insert(instagramPostInsights)
      .values({
        userId,
        mediaId: normalized.mediaId,
        mediaType: normalized.mediaType,
        caption: normalized.caption,
        permalink: normalized.permalink,
        mediaUrl: normalized.mediaUrl,
        thumbnailUrl: normalized.thumbnailUrl,
        mediaPublishedAt: normalized.publishedAt,
        reach: normalized.insights.reach,
        impressions: normalized.insights.impressions,
        likeCount: normalized.insights.likeCount,
        commentsCount: normalized.insights.commentsCount,
        savedCount: normalized.insights.savedCount,
        sharesCount: normalized.insights.sharesCount,
        totalInteractions: normalized.insights.totalInteractions,
        videoViews: normalized.insights.videoViews,
        avgWatchTimeMs: normalized.insights.avgWatchTimeMs,
        totalWatchTimeMs: normalized.insights.totalWatchTimeMs,
        profileVisits: normalized.insights.profileVisits,
        follows: normalized.insights.follows,
        storyTapsForward: normalized.insights.storyTapsForward,
        storyTapsBack: normalized.insights.storyTapsBack,
        storyExits: normalized.insights.storyExits,
        storyReplies: normalized.insights.storyReplies,
        rawInsights: raw,
        lastFetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [instagramPostInsights.userId, instagramPostInsights.mediaId],
        set: {
          caption: normalized.caption,
          permalink: normalized.permalink,
          mediaUrl: normalized.mediaUrl,
          thumbnailUrl: normalized.thumbnailUrl,
          reach: normalized.insights.reach,
          impressions: normalized.insights.impressions,
          likeCount: normalized.insights.likeCount,
          commentsCount: normalized.insights.commentsCount,
          savedCount: normalized.insights.savedCount,
          sharesCount: normalized.insights.sharesCount,
          totalInteractions: normalized.insights.totalInteractions,
          videoViews: normalized.insights.videoViews,
          avgWatchTimeMs: normalized.insights.avgWatchTimeMs,
          totalWatchTimeMs: normalized.insights.totalWatchTimeMs,
          profileVisits: normalized.insights.profileVisits,
          follows: normalized.insights.follows,
          storyTapsForward: normalized.insights.storyTapsForward,
          storyTapsBack: normalized.insights.storyTapsBack,
          storyExits: normalized.insights.storyExits,
          storyReplies: normalized.insights.storyReplies,
          rawInsights: raw,
          lastFetchedAt: new Date(),
        },
      });

    // Projection into content_posts for the existing page/table/scoring
    // code — 6 columns only, clicks always null (see protocol.ts's
    // INSTAGRAM_ORGANIC_CLICKS_AVAILABLE). Never touches source="manual"
    // rows (different externalId space entirely).
    await db
      .insert(contentPosts)
      .values({
        userId,
        platform: "Instagram",
        type: normalized.contentPostType,
        title: normalized.title,
        publishedAt: normalized.publishedAt.toISOString().slice(0, 10),
        url: normalized.permalink,
        views: normalized.views,
        likes: normalized.insights.likeCount,
        comments: normalized.insights.commentsCount,
        shares: normalized.insights.sharesCount,
        clicks: null,
        leads: null,
        source: "instagram",
        externalId: normalized.mediaId,
      })
      .onConflictDoUpdate({
        target: [contentPosts.userId, contentPosts.source, contentPosts.externalId],
        set: {
          title: normalized.title,
          url: normalized.permalink,
          views: normalized.views,
          likes: normalized.insights.likeCount,
          comments: normalized.insights.commentsCount,
          shares: normalized.insights.sharesCount,
        },
      });

    processed += 1;
  }

  return processed;
}

// Recent-media scope used by the recurring cron — see protocol.ts's
// INSTAGRAM_INSIGHTS_REFRESH_WINDOW_DAYS.
export function insightsRefreshSinceDate(windowDays: number): Date {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  return since;
}
