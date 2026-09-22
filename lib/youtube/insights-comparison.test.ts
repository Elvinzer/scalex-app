import { describe, expect, it } from "vitest";

import { computeVideoMetricComparisons, computeVideoPerformanceComparisons } from "./insights-comparison";
import type { YoutubeVideoInsightRow } from "./queries";

function video(id: string, publishedAt: string, retention: number): YoutubeVideoInsightRow {
  return {
    id,
    userId: "user",
    videoId: id,
    title: id,
    thumbnailUrl: null,
    durationSeconds: 600,
    creatorContentType: "VIDEO_ON_DEMAND",
    publishedAt: new Date(publishedAt),
    views: 1000,
    likes: null,
    comments: null,
    shares: null,
    estimatedMinutesWatched: null,
    averageViewDurationSeconds: null,
    averageViewPercentage: retention,
    subscribersGained: null,
    subscribersLost: null,
    impressions: null,
    impressionsClickThroughRate: null,
    privacyStatus: "public",
    retentionCurve: null,
    trafficSources: null,
    searchTerms: null,
    deepInsightsFetchedAt: null,
    productionHours: null,
    rawInsights: {},
    lastFetchedAt: new Date(publishedAt),
  };
}

describe("YouTube sliding comparison", () => {
  it("compares a long video with earlier long videos only", () => {
    const rows = [
      video("a", "2026-01-01T00:00:00Z", 40),
      video("b", "2026-01-02T00:00:00Z", 42),
      video("c", "2026-01-03T00:00:00Z", 41),
      video("d", "2026-01-04T00:00:00Z", 60),
    ];
    const result = computeVideoPerformanceComparisons(rows);
    expect(result.get("d")?.baseline).toBe(41);
    expect(result.get("d")?.tier).toBe("above");
  });

  it("does not benchmark low-sample videos", () => {
    const rows = [
      video("a", "2026-01-01T00:00:00Z", 40),
      video("b", "2026-01-02T00:00:00Z", 42),
      video("c", "2026-01-03T00:00:00Z", 41),
      video("d", "2026-01-04T00:00:00Z", 60),
    ].map((row, index) => index === 3 ? { ...row, views: 99 } : row);
    expect(computeVideoPerformanceComparisons(rows).size).toBe(0);
  });

  it("reuses the same sliding baseline for another metric", () => {
    const rows = [
      video("a", "2026-01-01T00:00:00Z", 40),
      video("b", "2026-01-02T00:00:00Z", 42),
      video("c", "2026-01-03T00:00:00Z", 41),
      video("d", "2026-01-04T00:00:00Z", 60),
    ];
    const result = computeVideoMetricComparisons(rows, new Map([["a", 100], ["b", 100], ["c", 100], ["d", 150]]));
    expect(result.get("d")?.ratio).toBe(1.5);
    expect(result.get("d")?.tier).toBe("above");
  });
});
