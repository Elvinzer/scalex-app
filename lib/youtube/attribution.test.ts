import { describe, expect, it } from "vitest";

import {
  computeReliability,
  conversionPerThousandViews,
  MIN_DECLARED_ATTRIBUTIONS_FOR_EUROS,
  type VideoAttributionTotals,
} from "./attribution-rules";

function totals(entries: Partial<VideoAttributionTotals>[]): Map<string, VideoAttributionTotals> {
  return new Map(
    entries.map((e, i) => [
      e.videoId ?? `v${i}`,
      {
        videoId: e.videoId ?? `v${i}`,
        declaredSales: e.declaredSales ?? 0,
        estimatedSales: e.estimatedSales ?? 0,
        declaredRevenueEur: e.declaredRevenueEur ?? 0,
        estimatedRevenueEur: e.estimatedRevenueEur ?? 0,
      },
    ])
  );
}

describe("attribution reliability gate", () => {
  it("blocks € figures until enough DECLARED attributions exist", () => {
    const r = computeReliability(totals([{ declaredSales: MIN_DECLARED_ATTRIBUTIONS_FOR_EUROS - 1 }]));
    expect(r.canShowEuros).toBe(false);
    expect(r.missingForEuros).toBe(1);
  });

  it("unlocks € figures at the threshold", () => {
    expect(computeReliability(totals([{ declaredSales: MIN_DECLARED_ATTRIBUTIONS_FOR_EUROS }])).canShowEuros).toBe(true);
  });

  it("never lets estimated attributions alone unlock € figures", () => {
    const r = computeReliability(totals([{ estimatedSales: 500 }]));
    expect(r.canShowEuros).toBe(false);
    expect(r.estimatedCount).toBe(500);
    expect(r.declaredCount).toBe(0);
  });

  it("counts declared and estimated separately across videos", () => {
    const r = computeReliability(totals([{ declaredSales: 2, estimatedSales: 1 }, { declaredSales: 1 }]));
    expect(r.declaredCount).toBe(3);
    expect(r.estimatedCount).toBe(1);
  });
});

describe("conversion per 1 000 views", () => {
  it("refuses to compute on a low-view video, where the figure would be arithmetic not signal", () => {
    expect(conversionPerThousandViews(40, 1)).toBeNull();
    expect(conversionPerThousandViews(null, 1)).toBeNull();
  });

  it("computes once the video has enough views", () => {
    expect(conversionPerThousandViews(10_000, 5)).toBeCloseTo(0.5);
  });
});
