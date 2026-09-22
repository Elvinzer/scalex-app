import { describe, expect, it } from "vitest";

import { snapshotImpressionsAtDay, snapshotViewsAtDay, velocityPercent } from "./velocity";
import type { YoutubeVideoSnapshotRow } from "./queries";

function snapshot(capturedOn: string, views: number, impressions: number | null = null): YoutubeVideoSnapshotRow {
  return {
    id: capturedOn,
    userId: "user",
    videoId: "video",
    capturedOn,
    views,
    estimatedMinutesWatched: null,
    averageViewPercentage: null,
    impressions,
    impressionsClickThroughRate: null,
    createdAt: new Date(`${capturedOn}T12:00:00Z`),
  };
}

describe("YouTube velocity", () => {
  it("uses the first snapshot on or after the target day", () => {
    expect(snapshotViewsAtDay([snapshot("2026-01-02", 1200)], new Date("2026-01-01T00:00:00Z"), 1)).toBe(1200);
    expect(snapshotImpressionsAtDay([snapshot("2026-01-02", 1200, 9000)], new Date("2026-01-01T00:00:00Z"), 1)).toBe(9000);
  });

  it("returns a percentage delta against the benchmark", () => {
    expect(velocityPercent(7900, 6200)).toBeCloseTo(27.419, 2);
    expect(velocityPercent(null, 100)).toBeNull();
  });
});
