import { inRange } from "@/lib/dashboard/metrics";
import { CANONICAL_METRIC_DEFINITIONS } from "./metric-definitions";

import type { MonthWindow } from "./completed-months";
import type { InstagramPostInsightRow } from "@/lib/instagram/queries";
import type { YoutubeVideoInsightRow } from "@/lib/youtube/queries";

export const CONTENT_RETENTION_BENCHMARK = CANONICAL_METRIC_DEFINITIONS.contentRetention.benchmark;

// Keep the registry referenced here so changes to the source contract cannot
// silently leave this calculation disconnected from the diagnostic model.
export const CONTENT_RETENTION_SOURCE = CANONICAL_METRIC_DEFINITIONS.contentRetention.source;

export type ContentRetentionSummary = {
  currentRate: number | null;
  benchmarkRate: number;
  views: number;
  videos: number;
  sources: Array<"youtube" | "instagram">;
};

type RetentionObservation = {
  rate: number;
  weight: number;
  source: "youtube" | "instagram";
};

function rawDurationMs(row: InstagramPostInsightRow): number | null {
  const raw = row.rawInsights;
  const candidates = [raw.video_duration_ms, raw.duration_ms, raw.video_duration_seconds];
  for (const candidate of candidates) {
    if (typeof candidate !== "number" || !Number.isFinite(candidate) || candidate <= 0) continue;
    return candidate > 10_000 ? candidate : candidate * 1_000;
  }
  return null;
}

function clampRate(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function computeContentRetentionSummary({
  months,
  youtubeVideos,
  instagramPosts,
}: {
  months: MonthWindow[];
  youtubeVideos: YoutubeVideoInsightRow[];
  instagramPosts: InstagramPostInsightRow[];
}): ContentRetentionSummary {
  const observations: RetentionObservation[] = [];

  for (const video of youtubeVideos) {
    const publishedAt = video.publishedAt.toISOString().slice(0, 10);
    if (!months.some(({ range }) => inRange(publishedAt, range)) || video.averageViewPercentage === null) continue;
    observations.push({
      rate: clampRate(video.averageViewPercentage / 100),
      weight: Math.max(1, video.views ?? 0),
      source: "youtube",
    });
  }

  for (const post of instagramPosts) {
    const publishedAt = post.mediaPublishedAt.toISOString().slice(0, 10);
    const durationMs = rawDurationMs(post);
    if (!months.some(({ range }) => inRange(publishedAt, range)) || durationMs === null || post.avgWatchTimeMs === null) continue;
    observations.push({
      rate: clampRate(post.avgWatchTimeMs / durationMs),
      weight: Math.max(1, post.videoViews ?? 0),
      source: "instagram",
    });
  }

  if (observations.length === 0) {
    return { currentRate: null, benchmarkRate: CONTENT_RETENTION_BENCHMARK, views: 0, videos: 0, sources: [] };
  }

  const totalWeight = observations.reduce((sum, observation) => sum + observation.weight, 0);
  const weightedRate = observations.reduce((sum, observation) => sum + observation.rate * observation.weight, 0) / totalWeight;
  const sources = Array.from(new Set(observations.map((observation) => observation.source)));

  return {
    currentRate: weightedRate,
    benchmarkRate: CONTENT_RETENTION_BENCHMARK,
    views: totalWeight,
    videos: observations.length,
    sources,
  };
}
