import type { RawYoutubeVideo, VideoAnalyticsMetrics } from "./client";

// Normalizes a raw YouTube video + its fetched analytics into our own
// domain, feeding both youtube_video_insights (full fidelity) and the
// projected content_posts row (see lib/youtube/backfill.ts). Mirrors
// lib/instagram/events.ts's normalizeMedia.

export type NormalizedYoutubeVideo = {
  videoId: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: Date;
  durationSeconds: number | null;
  // "public" | "unlisted" | "private" — null when the Data API didn't return
  // a status for this id. Only public videos are surfaced in the UI, see
  // isPublicVideo in lib/youtube/format.ts.
  privacyStatus: string | null;
  // Projection field for content_posts — see backfill.ts.
  views: number;
  // Full metric set for youtube_video_insights. No impressions/CTR fields —
  // see protocol.ts's YOUTUBE_THUMBNAIL_CTR_AVAILABLE, that data is never
  // fetched (the query always failed on the real API).
  insights: {
    likes: number | null;
    comments: number | null;
    shares: number | null;
    estimatedMinutesWatched: number | null;
    averageViewDurationSeconds: number | null;
    averageViewPercentage: number | null;
    subscribersGained: number | null;
    subscribersLost: number | null;
  };
};

function metric(metrics: VideoAnalyticsMetrics, key: string): number | null {
  return typeof metrics[key] === "number" ? metrics[key] : null;
}

export function normalizeVideo(
  video: RawYoutubeVideo,
  metrics: VideoAnalyticsMetrics,
  durationSeconds: number | null,
  privacyStatus: string | null
): NormalizedYoutubeVideo {
  return {
    videoId: video.id,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    publishedAt: new Date(video.publishedAt),
    durationSeconds,
    privacyStatus,
    views: metric(metrics, "views") ?? 0,
    insights: {
      likes: metric(metrics, "likes"),
      comments: metric(metrics, "comments"),
      shares: metric(metrics, "shares"),
      estimatedMinutesWatched: metric(metrics, "estimatedMinutesWatched"),
      averageViewDurationSeconds: metric(metrics, "averageViewDuration"),
      averageViewPercentage: metric(metrics, "averageViewPercentage"),
      subscribersGained: metric(metrics, "subscribersGained"),
      subscribersLost: metric(metrics, "subscribersLost"),
    },
  };
}
