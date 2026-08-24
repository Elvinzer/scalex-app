import { describe, expect, it } from "vitest";

import { estimateYoutubeRecommendationImpact } from "./recommendation-impact";

describe("estimateYoutubeRecommendationImpact", () => {
  it("anchors the estimate to the median rather than a viral outlier", () => {
    expect(estimateYoutubeRecommendationImpact([100, 120, 10_000], 1_000)).toEqual({
      value: 138,
      baseline: 120,
      floor: 78,
      ceiling: 138,
    });
  });

  it("clamps an optimistic model estimate to the planning range", () => {
    expect(estimateYoutubeRecommendationImpact([1_000, 1_200], 10_000).value).toBe(1_265);
  });

  it("returns a safe minimum when source views are missing", () => {
    expect(estimateYoutubeRecommendationImpact([], null)).toEqual({
      value: 1,
      baseline: 0,
      floor: 1,
      ceiling: 1,
    });
  });
});
