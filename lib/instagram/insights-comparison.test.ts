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
      makeRow({ mediaId: "a", totalInteractions: 10, reach: 100 }),
      makeRow({ mediaId: "b", totalInteractions: 20, reach: 100 }),
    ];
    expect(computePostPerformanceComparisons(rows).size).toBe(0);
  });

  it("flags a post well above the cohort median (interactions/reach rate) as 'above'", () => {
    const rows = [
      makeRow({ mediaId: "a", totalInteractions: 10, reach: 100 }), // 10%
      makeRow({ mediaId: "b", totalInteractions: 9, reach: 100 }), // 9%
      makeRow({ mediaId: "c", totalInteractions: 11, reach: 100 }), // 11%
      makeRow({ mediaId: "d", totalInteractions: 50, reach: 100 }), // 50%
    ];
    const result = computePostPerformanceComparisons(rows);
    expect(result.get("d")?.tier).toBe("above");
    expect(result.get("d")?.value).toBeCloseTo(0.5);
    expect(result.get("a")?.tier).toBe("inline");
  });

  it("flags a post well below the cohort median as 'below'", () => {
    const rows = [
      makeRow({ mediaId: "a", totalInteractions: 10, reach: 100 }),
      makeRow({ mediaId: "b", totalInteractions: 10, reach: 100 }),
      makeRow({ mediaId: "c", totalInteractions: 10, reach: 100 }),
      makeRow({ mediaId: "d", totalInteractions: 1, reach: 200 }),
    ];
    const result = computePostPerformanceComparisons(rows);
    expect(result.get("d")?.tier).toBe("below");
  });

  it("ranks a post reaching far more people but at a worse rate below one with a smaller, more engaged reach", () => {
    const rows = [
      makeRow({ mediaId: "a", totalInteractions: 100, reach: 1000 }), // 10%
      makeRow({ mediaId: "b", totalInteractions: 100, reach: 1000 }), // 10%
      makeRow({ mediaId: "c", totalInteractions: 100, reach: 1000 }), // 10%
      makeRow({ mediaId: "big-reach-low-rate", totalInteractions: 200, reach: 10000 }), // 2%
    ];
    const result = computePostPerformanceComparisons(rows);
    expect(result.get("big-reach-low-rate")?.tier).toBe("below");
  });

  it("uses raw reach for Stories, which have no interactions metric", () => {
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
      makeRow({ mediaId: "f1", mediaType: "IMAGE", totalInteractions: 10, reach: 100 }),
      makeRow({ mediaId: "f2", mediaType: "IMAGE", totalInteractions: 10, reach: 100 }),
      makeRow({ mediaId: "f3", mediaType: "IMAGE", totalInteractions: 10, reach: 100 }),
    ];
    const result = computePostPerformanceComparisons(rows);
    expect(result.get("f1")?.tier).toBe("inline");
    expect(result.get("s1")?.tier).toBe("inline");
  });

  it("excludes a feed post missing reach (rate not computable) from the result", () => {
    const rows = [
      makeRow({ mediaId: "a", totalInteractions: 10, reach: 100 }),
      makeRow({ mediaId: "b", totalInteractions: 10, reach: 100 }),
      makeRow({ mediaId: "c", totalInteractions: 10, reach: 100 }),
      makeRow({ mediaId: "d", totalInteractions: 10, reach: null }),
    ];
    const result = computePostPerformanceComparisons(rows);
    expect(result.has("d")).toBe(false);
  });
});
