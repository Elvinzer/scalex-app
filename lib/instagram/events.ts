import type { InstagramMediaType } from "./protocol";
import type { MediaInsights, RawInstagramMedia } from "./client";

// Normalizes a raw Instagram media item + its fetched insights into our own
// domain, feeding both instagram_post_insights (full fidelity) and the
// projected content_posts row (see lib/instagram/backfill.ts).

export type NormalizedInstagramPost = {
  mediaId: string;
  mediaType: InstagramMediaType;
  caption: string | null;
  permalink: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date;
  // Projection fields for content_posts — see backfill.ts.
  contentPostType: "post" | "reel" | "story" | "video";
  title: string;
  views: number;
  // Full metric set for instagram_post_insights.
  insights: {
    reach: number | null;
    impressions: number | null;
    likeCount: number | null;
    commentsCount: number | null;
    savedCount: number | null;
    sharesCount: number | null;
    totalInteractions: number | null;
    videoViews: number | null;
    avgWatchTimeMs: number | null;
    totalWatchTimeMs: number | null;
    profileVisits: number | null;
    follows: number | null;
    storyTapsForward: number | null;
    storyTapsBack: number | null;
    storyExits: number | null;
    storyReplies: number | null;
  };
};

function metric(insights: MediaInsights, key: string): number | null {
  return typeof insights[key] === "number" ? insights[key] : null;
}

// media_type -> our existing contentPostType enum. Instagram Live isn't
// retrievable via this API at all, so "live" is never produced here (stays
// manual-only).
function toContentPostType(mediaType: InstagramMediaType): "post" | "reel" | "story" | "video" {
  if (mediaType === "STORY") return "story";
  if (mediaType === "VIDEO") return "video";
  return "post"; // IMAGE | CAROUSEL_ALBUM
}

// title is NOT NULL on content_posts — falls back to a dated placeholder
// when the post has no caption.
function toTitle(caption: string | null, publishedAt: Date): string {
  if (caption) {
    const firstLine = caption.split("\n")[0]!.trim();
    return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine || `Post Instagram du ${publishedAt.toISOString().slice(0, 10)}`;
  }
  return `Post Instagram du ${publishedAt.toISOString().slice(0, 10)}`;
}

// "views" (content_posts, a single required number) is derived per media
// type: video plays for VIDEO/REELS falling back to reach if plays is
// unavailable, reach for IMAGE/CAROUSEL/STORY. The raw values are never
// collapsed in instagram_post_insights — reach/videoViews stay separate
// columns there.
function toViews(mediaType: InstagramMediaType, insights: MediaInsights): number {
  if (mediaType === "VIDEO") {
    return metric(insights, "plays") ?? metric(insights, "reach") ?? 0;
  }
  return metric(insights, "reach") ?? 0;
}

export function normalizeMedia(media: RawInstagramMedia, insights: MediaInsights): NormalizedInstagramPost {
  const publishedAt = new Date(media.timestamp);

  return {
    mediaId: media.id,
    mediaType: media.mediaType,
    caption: media.caption,
    permalink: media.permalink,
    mediaUrl: media.mediaUrl,
    thumbnailUrl: media.thumbnailUrl,
    publishedAt,
    contentPostType: toContentPostType(media.mediaType),
    title: toTitle(media.caption, publishedAt),
    views: toViews(media.mediaType, insights),
    insights: {
      reach: metric(insights, "reach"),
      impressions: metric(insights, "impressions"),
      likeCount: media.likeCount,
      commentsCount: media.commentsCount,
      savedCount: metric(insights, "saved"),
      sharesCount: metric(insights, "shares"),
      totalInteractions: metric(insights, "total_interactions"),
      videoViews: metric(insights, "plays"),
      avgWatchTimeMs: metric(insights, "ig_reels_avg_watch_time"),
      totalWatchTimeMs: metric(insights, "ig_reels_video_view_total_time"),
      profileVisits: metric(insights, "profile_visits"),
      follows: metric(insights, "follows"),
      storyTapsForward: metric(insights, "taps_forward"),
      storyTapsBack: metric(insights, "taps_back"),
      storyExits: metric(insights, "exits"),
      storyReplies: metric(insights, "replies"),
    },
  };
}
