import { eq } from "drizzle-orm";

import { db } from "@/db";
import { contentPosts, instagramPostInsights } from "@/db/schema";

import { fetchCarouselChildren, fetchMediaInsights, listMedia, listStories } from "./client";
import { normalizeMedia } from "./events";
import { INSTAGRAM_BACKFILL_ITEM_THROTTLE_MS, INSTAGRAM_BACKFILL_TIME_BUDGET_MS } from "./protocol";

export type BackfillResult = { processed: number; skipped: number; completed: boolean };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function knownMediaIds(userId: string): Promise<Set<string>> {
  const rows = await db.select({ mediaId: instagramPostInsights.mediaId }).from(instagramPostInsights).where(eq(instagramPostInsights.userId, userId));
  return new Set(rows.map((row) => row.mediaId));
}

// Core Instagram -> Scale X sync, shared by the Inngest connect-job and the
// recurring insights-refresh cron. Unlike iClosed/Calendly's backfill
// (onConflictDoNothing — call data is finalized once written), this always
// upserts: organic insight numbers keep climbing for days after a post goes
// up, so a re-run must overwrite with fresher values, not skip. Still fully
// idempotent (safe to run repeatedly / replay on failure) — just via update
// instead of no-op on conflict.
//
// `sinceDate` restricts which ALREADY-SEEN media get their insights
// refetched (the recurring cron/manual refresh only want to re-poll recent
// posts for climbing numbers — see protocol.ts's
// INSTAGRAM_INSIGHTS_REFRESH_WINDOW_DAYS); omit it for the full connect-time
// backfill. Critically, `sinceDate` NEVER excludes a media item this user
// has never been synced before, regardless of its age — listMedia() always
// returns everything Meta's API exposes (up to the cap), so a media item
// outside the recent window but missing from instagram_post_insights is
// still fetched. Without this, an item that failed to sync once (the
// pagination/per-item bugs fixed alongside this comment, or a transient
// Meta error) could NEVER be recovered by anything except a full
// disconnect+reconnect — every recurring cron run and every manual
// "Rafraîchir" click would keep silently ignoring it forever, since both
// only ever pass a recent `sinceDate`, never omit it.
export async function backfillInstagramPosts(userId: string, accessToken: string, sinceDate?: Date): Promise<BackfillResult> {
  // /me/media never returns Stories (a separate, ephemeral edge — see
  // client.ts's listStories) — combined here so both flow through the same
  // insights-fetch + upsert pipeline below. Distinct ID spaces, no dedup
  // needed.
  const [media, stories, existingMediaIds] = await Promise.all([listMedia(accessToken), listStories(accessToken), knownMediaIds(userId)]);
  const combined = [...media, ...stories];
  const scoped = sinceDate
    ? combined.filter((item) => new Date(item.timestamp) >= sinceDate || !existingMediaIds.has(item.id))
    : combined;
  if (scoped.length === 0) return { processed: 0, skipped: 0, completed: true };

  const startedAt = Date.now();
  let processed = 0;
  let skipped = 0;
  let completed = true;
  for (const [index, item] of scoped.entries()) {
    // A large never-synced backlog (see the module comment above) can take
    // longer than a single serverless invocation's time budget — confirmed
    // in production (Vercel killed the function outright past its
    // maxDuration). Stopping early and reporting `completed: false` lets
    // the caller schedule a follow-up run instead of losing whatever
    // wasn't reached yet, or worse, the function dying mid-item-write.
    if (Date.now() - startedAt > INSTAGRAM_BACKFILL_TIME_BUDGET_MS) {
      completed = false;
      console.error(`[instagram] backfill for user ${userId}: time budget reached, ${scoped.length - index} item(s) deferred to a follow-up run`);
      break;
    }
    try {
      const { metrics, raw } = await fetchMediaInsights(accessToken, item.id, item.mediaType);
      // A CAROUSEL_ALBUM's own object never exposes media_url/thumbnail_url
      // — resolve its cover from the first child instead (best-effort, null
      // on any failure).
      const carouselCoverUrl =
        item.mediaType === "CAROUSEL_ALBUM" ? (await fetchCarouselChildren(accessToken, item.id)).coverUrl : null;
      const normalized = normalizeMedia(item, metrics, carouselCoverUrl);

      await processNormalizedPost(userId, normalized, raw);
      processed += 1;
    } catch (error) {
      skipped += 1;
      console.error(`[instagram] skipping media ${item.id} (${item.mediaType}) after a sync error`, error);
    }
    // Throttle between items — a first-time backfill can otherwise fire one
    // insights call per post in a tight loop, risking Meta's per-account
    // rate limit before reaching the end of a large history.
    if (index < scoped.length - 1) await sleep(INSTAGRAM_BACKFILL_ITEM_THROTTLE_MS);
  }

  if (skipped > 0) {
    console.error(`[instagram] backfill for user ${userId}: ${processed} processed, ${skipped} skipped after errors`);
  }

  return { processed, skipped, completed };
}

async function processNormalizedPost(
  userId: string,
  normalized: ReturnType<typeof normalizeMedia>,
  raw: Record<string, unknown>
): Promise<void> {
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

  // Projection into content_posts for the existing page/table/scoring code
  // — 6 columns only, clicks always null (see protocol.ts's
  // INSTAGRAM_ORGANIC_CLICKS_AVAILABLE). Never touches source="manual" rows
  // (different externalId space entirely).
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
}

// Recent-media scope used by the recurring cron — see protocol.ts's
// INSTAGRAM_INSIGHTS_REFRESH_WINDOW_DAYS.
export function insightsRefreshSinceDate(windowDays: number): Date {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  return since;
}
