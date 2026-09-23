import { describe, expect, it } from "vitest";

import { diagnoseYoutubeVideo } from "./diagnosis";
import type { YoutubeVideoInsightRow } from "./queries";

function video(overrides: Partial<YoutubeVideoInsightRow> = {}): YoutubeVideoInsightRow {
  return {
    id: "id",
    userId: "user",
    videoId: "video",
    title: "Video",
    thumbnailUrl: null,
    durationSeconds: 600,
    creatorContentType: null,
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    views: 1000,
    likes: 10,
    comments: 2,
    shares: 1,
    estimatedMinutesWatched: 100,
    averageViewDurationSeconds: 120,
    averageViewPercentage: 50,
    subscribersGained: 10,
    subscribersLost: 2,
    impressions: null,
    impressionsClickThroughRate: null,
    reachStatus: "pending",
    privacyStatus: "public",
    retentionCurve: [{ ratio: 0.05, watchRatio: 0.7 }],
    trafficSources: null,
    searchTerms: null,
    deepInsightsFetchedAt: null,
    productionHours: null,
    rawInsights: {},
    lastFetchedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  };
}

describe("YouTube diagnosis", () => {
  it("keeps every axis unavailable below the low-sample threshold", () => {
    const result = diagnoseYoutubeVideo({ video: video({ views: 99 }), bookings: 3, revenueEur: 1000 });
    expect(result.every((axis) => axis.level === "unavailable")).toBe(true);
  });

  it("does not invent a click signal when CTR is missing", () => {
    const result = diagnoseYoutubeVideo({ video: video(), baselineRetention: 40, bookings: null, revenueEur: null });
    expect(result.find((axis) => axis.axis === "click")?.level).toBe("unavailable");
    expect(result.find((axis) => axis.axis === "retention")?.level).toBe("good");
  });
});
