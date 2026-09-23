import { resolveVideoFormat } from "./format";
import type { YoutubeVideoInsightRow } from "./queries";

export type VideoPerformanceTier = "above" | "inline" | "below";
export type VideoPerformanceComparison = {
  tier: VideoPerformanceTier;
  ratio: number;
  value: number;
  baseline: number;
  cohortSize: number;
};

export type VideoComparisonMetric =
  | "views"
  | "impressions"
  | "ctr"
  | "retention30"
  | "retention"
  | "subsPer1000"
  | "bookingsPer1000"
  | "revenuePer1000";

const MIN_COHORT_SIZE = 3;
const BASELINE_SIZE = 10;
const ABOVE_RATIO = 1.15;
const BELOW_RATIO = 0.85;
const MIN_COMPARABLE_VIEWS = 100;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export function comparisonMetric(row: YoutubeVideoInsightRow): number | null {
  return row.averageViewPercentage;
}

function isLongForm(row: YoutubeVideoInsightRow): boolean {
  return resolveVideoFormat(row) === "long";
}

function baselineForVideo(row: YoutubeVideoInsightRow, rows: YoutubeVideoInsightRow[]): YoutubeVideoInsightRow[] {
  if (!isLongForm(row)) return [];
  return rows
    .filter(
      (candidate) =>
        candidate.videoId !== row.videoId &&
        isLongForm(candidate) &&
        (candidate.views ?? 0) >= MIN_COMPARABLE_VIEWS &&
        candidate.publishedAt < row.publishedAt,
    )
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, BASELINE_SIZE)
}

function compareValues(value: number | null, baselineValues: number[]): VideoPerformanceComparison | null {
  if (value === null || baselineValues.length < MIN_COHORT_SIZE) return null;
  const baseline = median(baselineValues);
  if (baseline <= 0) return null;
  const ratio = value / baseline;
  const tier: VideoPerformanceTier = ratio >= ABOVE_RATIO ? "above" : ratio <= BELOW_RATIO ? "below" : "inline";
  return { tier, ratio, value, baseline, cohortSize: baselineValues.length };
}

// Each long-form video compares with the latest ten long-form videos that
// were already published when it went live. This keeps Shorts out of the
// benchmark and prevents later uploads from changing an old comparison.
export function computeVideoPerformanceComparisons(rows: YoutubeVideoInsightRow[]): Map<string, VideoPerformanceComparison> {
  return computeVideoMetricComparisons(rows, new Map(rows.map((row) => [row.videoId, comparisonMetric(row)])));
}

export function computeVideoMetricComparisons(
  rows: YoutubeVideoInsightRow[],
  values: Map<string, number | null>,
): Map<string, VideoPerformanceComparison> {
  const result = new Map<string, VideoPerformanceComparison>();
  for (const row of rows) {
    if (!isLongForm(row) || (row.views ?? 0) < MIN_COMPARABLE_VIEWS) continue;
    const baselineValues = baselineForVideo(row, rows)
      .map((candidate) => values.get(candidate.videoId) ?? null)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    const comparison = compareValues(values.get(row.videoId) ?? null, baselineValues);
    if (comparison) result.set(row.videoId, comparison);
  }
  return result;
}

export function comparisonBaseline(row: YoutubeVideoInsightRow, rows: YoutubeVideoInsightRow[]): number | null {
  const values = baselineForVideo(row, rows)
    .map(comparisonMetric)
    .filter((value): value is number => value !== null);
  return values.length < MIN_COHORT_SIZE ? null : median(values);
}
