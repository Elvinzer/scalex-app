import type { InstagramPostInsightRow } from "./queries";

// Turns raw per-post numbers into a comparative signal — "this post did
// better/worse than your own baseline" — rather than a wall of counts with
// no reference point. Pure/derived from data already in
// instagram_post_insights, computed in code per CLAUDE.md's rule against
// pre-aggregating in the LLM. Pendant of lib/content-posts/rates.ts, but for
// the full-fidelity Instagram insights rather than the 6-column projection.

export type PostPerformanceTier = "above" | "inline" | "below";
// `value` is the post's own metric (a rate for feed posts, see
// comparisonMetric below) — exposed so callers can render the same number
// the tier was computed from without recomputing it themselves.
export type PostPerformanceComparison = { tier: PostPerformanceTier; ratio: number; value: number; cohortSize: number };

const MIN_COHORT_SIZE = 3;
const ABOVE_RATIO = 1.3;
const BELOW_RATIO = 0.7;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

// Feed posts (image/video/carousel): interactions AS A SHARE OF REACH
// ("engagement rate by reach") — the metric content strategists actually
// compare across posts, since it normalizes for reach differences instead
// of just rewarding whatever got seen the most. Raw totalInteractions would
// make a post that reached 10x more people look "better" even at a much
// worse rate. Stories: no equivalent rate exists (no interactions metric,
// see protocol.ts's INSTAGRAM_INSIGHTS_METRICS.STORY) — reach itself is the
// only comparable number there.
//
// Exported (not just used internally) so callers can show/sort by this same
// rate even for a post whose cohort is below MIN_COHORT_SIZE and therefore
// has no entry in computePostPerformanceComparisons' result — the number
// itself is still meaningful without a tier/color to attach to it.
export function comparisonMetric(row: InstagramPostInsightRow): number | null {
  if (row.mediaType === "STORY") return row.reach;
  if (row.totalInteractions === null || !row.reach) return null;
  return row.totalInteractions / row.reach;
}

// Two cohorts only — "story" (ephemeral) vs "feed" (everything permanent:
// image/video/carousel) — rather than one per exact media type. A precise
// per-type split (IMAGE vs VIDEO vs CAROUSEL_ALBUM separately) reads as more
// rigorous but produces near-empty cohorts for most accounts (confirmed
// against real data early on: a connected account with only 7 total posts
// across 3 media types), which defeats the point — a median of 1-2 posts is
// not a meaningful baseline. Story vs feed reflects the real scale
// difference (ephemeral reach vs. permanent-post engagement) while staying
// usable early.
function cohortKey(row: InstagramPostInsightRow): "story" | "feed" {
  return row.mediaType === "STORY" ? "story" : "feed";
}

export function computePostPerformanceComparisons(rows: InstagramPostInsightRow[]): Map<string, PostPerformanceComparison> {
  const byCohort = new Map<string, { mediaId: string; value: number }[]>();
  for (const row of rows) {
    const value = comparisonMetric(row);
    if (value === null) continue;
    const key = cohortKey(row);
    const bucket = byCohort.get(key) ?? [];
    bucket.push({ mediaId: row.mediaId, value });
    byCohort.set(key, bucket);
  }

  const result = new Map<string, PostPerformanceComparison>();
  for (const bucket of byCohort.values()) {
    if (bucket.length < MIN_COHORT_SIZE) continue;
    const baseline = median(bucket.map((entry) => entry.value));
    if (baseline <= 0) continue;
    for (const entry of bucket) {
      const ratio = entry.value / baseline;
      const tier: PostPerformanceTier = ratio >= ABOVE_RATIO ? "above" : ratio <= BELOW_RATIO ? "below" : "inline";
      result.set(entry.mediaId, { tier, ratio, value: entry.value, cohortSize: bucket.length });
    }
  }
  return result;
}
