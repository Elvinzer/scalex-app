import { describe, expect, it } from "vitest";

import type { VideoPerformanceComparison } from "./insights-comparison";
import { summarizeYoutubeTableRow, tableSignalFromComparison } from "./table-analysis";

function comparison(ratio: number): VideoPerformanceComparison {
  return { ratio, tier: ratio >= 1.15 ? "above" : ratio <= 0.85 ? "below" : "inline", value: ratio * 100, baseline: 100, cohortSize: 10 };
}

describe("YouTube table analysis", () => {
  it("turns extreme comparisons into a short status instead of a large delta", () => {
    expect(tableSignalFromComparison(2663, comparison(12.42))).toBe("strong");
    expect(tableSignalFromComparison(900, comparison(0.7))).toBe("weak");
    expect(tableSignalFromComparison(null, null)).toBe("unavailable");
  });

  it("chooses the main lever for a readable row diagnosis", () => {
    expect(summarizeYoutubeTableRow({ performance: "strong", diffusion: "good", click: "good", hook: "good", retention: "good", growth: "weak", business: "neutral" })).toEqual({ key: "strongAudienceLowConversion", tone: "caution" });
    expect(summarizeYoutubeTableRow({ performance: "neutral", diffusion: "good", click: "good", hook: "weak", retention: "neutral", growth: "neutral", business: "unavailable" })).toEqual({ key: "goodThumbnailWeakHook", tone: "critical" });
    expect(summarizeYoutubeTableRow({ performance: "strong", diffusion: "good", click: "good", hook: "good", retention: "good", growth: "good", business: "strong" })).toEqual({ key: "strongBusinessConversion", tone: "healthy" });
    expect(summarizeYoutubeTableRow({ performance: "neutral", diffusion: "unavailable", click: "unavailable", hook: "good", retention: "good", growth: "neutral", business: "unavailable" })).toEqual({ key: "working", tone: "caution" });
  });
});
