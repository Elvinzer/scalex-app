import { describe, expect, it } from "vitest";

import { computePostPerformanceComparisons } from "./insights-comparison";
import type { InstagramPostInsightRow } from "./queries";

function makeRow(overrides: Partial<InstagramPostInsightRow> & { mediaId: string }): InstagramPostInsightRow {
  return {
    id: overrides.mediaId,
    userId: "user-1",
    mediaType: "IMAGE",
    caption: null,
    permalink: null,
    mediaUrl: null,
    thumbnailUrl: null,
    mediaPublishedAt: new Date("2026-01-01T00:00:00Z"),
    reach: null,
    impressions: null,
    likeCount: null,
    commentsCount: null,
    savedCount: null,
    sharesCount: null,
    totalInteractions: null,
    videoViews: null,
    avgWatchTimeMs: null,
    totalWatchTimeMs: null,
    profileVisits: null,
    follows: null,
    storyTapsForward: null,
    storyTapsBack: null,
    storyExits: null,
    storyReplies: null,
    rawInsights: {},
    lastFetchedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("computePostPerformanceComparisons", () => {
  it("ignores a cohort smaller than the minimum size", () => {
    const rows = [
      makeRow({ mediaId: "a", totalInteractions: 10 }),
      makeRow({ mediaId: "b", totalInteractions: 20 }),
    ];
    expect(computePostPerformanceComparisons(rows).size).toBe(0);
  });

  it("flags a post well above the cohort median as 'above'", () => {
    const rows = [
      makeRow({ mediaId: "a", totalInteractions: 100 }),
      makeRow({ mediaId: "b", totalInteractions: 90 }),
      makeRow({ mediaId: "c", totalInteractions: 110 }),
      makeRow({ mediaId: "d", totalInteractions: 500 }),
    ];
    const result = computePostPerformanceComparisons(rows);
    expect(result.get("d")?.tier).toBe("above");
    expect(result.get("a")?.tier).toBe("inline");
  });

  it("flags a post well below the cohort median as 'below'", () => {
    const rows = [
      makeRow({ mediaId: "a", totalInteractions: 100 }),
      makeRow({ mediaId: "b", totalInteractions: 100 }),
      makeRow({ mediaId: "c", totalInteractions: 100 }),
      makeRow({ mediaId: "d", totalInteractions: 5 }),
    ];
    const result = computePostPerformanceComparisons(rows);
    expect(result.get("d")?.tier).toBe("below");
  });

  it("falls back to reach when totalInteractions is null (e.g. Stories)", () => {
    const rows = [
      makeRow({ mediaId: "a", mediaType: "STORY", totalInteractions: null, reach: 50 }),
      makeRow({ mediaId: "b", mediaType: "STORY", totalInteractions: null, reach: 55 }),
      makeRow({ mediaId: "c", mediaType: "STORY", totalInteractions: null, reach: 400 }),
    ];
    const result = computePostPerformanceComparisons(rows);
    expect(result.get("c")?.tier).toBe("above");
  });

  it("keeps story and feed posts in separate cohorts", () => {
    const rows = [
      makeRow({ mediaId: "s1", mediaType: "STORY", totalInteractions: null, reach: 1000 }),
      makeRow({ mediaId: "s2", mediaType: "STORY", totalInteractions: null, reach: 1000 }),
      makeRow({ mediaId: "s3", mediaType: "STORY", totalInteractions: null, reach: 1000 }),
      makeRow({ mediaId: "f1", mediaType: "IMAGE", totalInteractions: 10 }),
      makeRow({ mediaId: "f2", mediaType: "IMAGE", totalInteractions: 10 }),
      makeRow({ mediaId: "f3", mediaType: "IMAGE", totalInteractions: 10 }),
    ];
    const result = computePostPerformanceComparisons(rows);
    // A feed post with 10 interactions must not be compared against a
    // 1000-reach story baseline just because both cohorts exist.
    expect(result.get("f1")?.tier).toBe("inline");
    expect(result.get("s1")?.tier).toBe("inline");
  });

  it("excludes a post with no usable metric from the result", () => {
    const rows = [
      makeRow({ mediaId: "a", totalInteractions: 10 }),
      makeRow({ mediaId: "b", totalInteractions: 10 }),
      makeRow({ mediaId: "c", totalInteractions: 10 }),
      makeRow({ mediaId: "d", totalInteractions: null, reach: null }),
    ];
    const result = computePostPerformanceComparisons(rows);
    expect(result.has("d")).toBe(false);
  });
});
