import type { ContentMetricKey } from "@/lib/diagnostic/content-metrics";
import { scoreAgainstBenchmark } from "@/lib/scoring";
import { rate } from "@/lib/setting/funnel";

import type { ContentPostRates, ContentPostRow } from "./types";

export function computePostRates(post: ContentPostRow): ContentPostRates {
  const engagement = (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0);

  return {
    engagementRate: rate(engagement, post.views),
    // Never coerce "never measured" (null — permanently the case for
    // organic Instagram posts) into a measured 0 rate. Same guard on
    // leads: content_posts.leads is never populated automatically (no
    // manual entry path left, and Instagram exposes no lead-attribution
    // data), so this was always silently showing a false "0%" before.
    clickRate: post.clicks === null ? null : rate(post.clicks, post.views),
    viewToLeadRate: post.leads === null ? null : rate(post.leads, post.views),
  };
}

// Per-post performance score (0-100), shown as a column in posts-table.tsx —
// distinct from the "Top" badge (a single best-of-the-month nudge, not a
// score). Averages the two ratios that share a denominator with the
// aggregate content benchmarks (content_click_rate = clicks/views,
// content_lead_rate = leads/CLICKS — note this is a different denominator
// than the viewToLeadRate column above, which stays leads/views for its own
// existing display): each compared to its matching benchmark via the same
// scoreAgainstBenchmark used for lever scoring, then averaged. null when
// neither ratio is measurable (no views/clicks yet) rather than a fabricated
// score.
export function computePostScore(post: ContentPostRow, contentBenchmarks: Record<ContentMetricKey, number>): number | null {
  const clickRate = post.clicks === null ? null : rate(post.clicks, post.views);
  const clickToLeadRate = rate(post.leads ?? 0, post.clicks ?? 0);

  const scores = [
    clickRate !== null ? scoreAgainstBenchmark(clickRate, contentBenchmarks.content_click_rate) : null,
    clickToLeadRate !== null ? scoreAgainstBenchmark(clickToLeadRate, contentBenchmarks.content_lead_rate) : null,
  ].filter((score): score is number => score !== null);

  return scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null;
}
