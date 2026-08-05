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
  // Projection field for content_posts — see backfill.ts.
  views: number;
  // Full metric set for youtube_video_insights.
  insights: {
    likes: number | null;
    comments: number | null;
    shares: number | null;
    estimatedMinutesWatched: number | null;
    averageViewDurationSeconds: number | null;
    averageViewPercentage: number | null;
    subscribersGained: number | null;
    subscribersLost: number | null;
    impressions: number | null;
    impressionsClickThroughRate: number | null;
  };
};

function metric(metrics: VideoAnalyticsMetrics, key: string): number | null {
  return typeof metrics[key] === "number" ? metrics[key] : null;
}

export function normalizeVideo(
  video: RawYoutubeVideo,
  metrics: VideoAnalyticsMetrics,
  durationSeconds: number | null
): NormalizedYoutubeVideo {
  return {
    videoId: video.id,
    title: video.title,
    thumbnailUrl: video.thumbnailUrl,
    publishedAt: new Date(video.publishedAt),
    durationSeconds,
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
      impressions: metric(metrics, "impressions"),
      impressionsClickThroughRate: metric(metrics, "impressionsClickThroughRate"),
    },
  };
}
