export type YoutubeImpactEstimate = {
  value: number;
  baseline: number;
  floor: number;
  ceiling: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/**
 * Keep the model's view estimate anchored to the channel's typical source
 * videos. The median limits the influence of one viral outlier, while the
 * narrow range keeps the number useful as a planning signal instead of a
 * promise.
 */
export function estimateYoutubeRecommendationImpact(
  sourceViews: number[],
  modelImpact: number | null,
): YoutubeImpactEstimate {
  const validViews = sourceViews.filter((value) => Number.isFinite(value) && value >= 0);
  const baseline = median(validViews) ?? 0;
  const floor = Math.max(1, Math.round(baseline * 0.65));
  const ceiling = Math.max(floor, Math.round(baseline * 1.15));
  const candidate = modelImpact === null ? baseline : modelImpact;
  const value = Math.max(floor, Math.min(Math.round(candidate), ceiling));

  return { value, baseline, floor, ceiling };
}
