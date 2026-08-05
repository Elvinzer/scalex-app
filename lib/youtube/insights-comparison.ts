import type { YoutubeVideoInsightRow } from "./queries";

// Turns raw per-video numbers into a comparative signal — "this video did
// better/worse than your own baseline" — rather than a wall of counts with
// no reference point. Mirrors lib/instagram/insights-comparison.ts.
//
// Comparison metric is audience retention (averageViewPercentage), not CTR:
// thumbnail impressions/CTR are not retrievable via the real-time YouTube
// Analytics API this integration uses — confirmed by a live probe, see
// protocol.ts's YOUTUBE_THUMBNAIL_CTR_AVAILABLE — so it was never actually
// populated and this comparison was permanently dead when built on it.
// Retention is the closest working analog: it's the other metric YouTube's
// own docs cite as most correlated with algorithmic promotion, alongside
// CTR, and it's a real, always-fetchable number for every synced video.

export type VideoPerformanceTier = "above" | "inline" | "below";
export type VideoPerformanceComparison = { tier: VideoPerformanceTier; ratio: number; value: number; cohortSize: number };

const MIN_COHORT_SIZE = 3;
const ABOVE_RATIO = 1.3;
const BELOW_RATIO = 0.7;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

// Exported (not just used internally) so callers can show/sort by this same
// value even for a video whose cohort is below MIN_COHORT_SIZE and therefore
// has no entry in computeVideoPerformanceComparisons' result. Null when
// YouTube hasn't surfaced retention data yet (common for videos in their
// first hours/days).
export function comparisonMetric(row: YoutubeVideoInsightRow): number | null {
  return row.averageViewPercentage;
}

// Single cohort (all videos) rather than split by duration/format — a
// per-duration-bucket split reads as more rigorous but produces near-empty
// cohorts for most channels early on, same reasoning as Instagram's
// story-vs-feed simplification.
export function computeVideoPerformanceComparisons(rows: YoutubeVideoInsightRow[]): Map<string, VideoPerformanceComparison> {
  const withMetric = rows
    .map((row) => ({ videoId: row.videoId, value: comparisonMetric(row) }))
    .filter((entry): entry is { videoId: string; value: number } => entry.value !== null);

  const result = new Map<string, VideoPerformanceComparison>();
  if (withMetric.length < MIN_COHORT_SIZE) return result;

  const baseline = median(withMetric.map((entry) => entry.value));
  if (baseline <= 0) return result;

  for (const entry of withMetric) {
    const ratio = entry.value / baseline;
    const tier: VideoPerformanceTier = ratio >= ABOVE_RATIO ? "above" : ratio <= BELOW_RATIO ? "below" : "inline";
    result.set(entry.videoId, { tier, ratio, value: entry.value, cohortSize: withMetric.length });
  }
  return result;
}
