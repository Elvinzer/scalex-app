import { describe, expect, it } from "vitest";

import { buildRevenueProjection } from "./revenue-projection";

describe("buildRevenueProjection", () => {
  it("uses the four-month average, then adds the bottleneck and three largest levers", () => {
    expect(buildRevenueProjection({
      cashContractedTotal: 40000,
      monthsCount: 4,
      bottleneckGain: 2500,
      leverGains: [900, 4200, 1600, 300, 0],
    })).toEqual({
      averageMonthlyRevenue: 10000,
      bottleneckGain: 2500,
      optimizedMonthlyRevenue: 12500,
      topLeverGains: [4200, 1600, 900],
      potentialMonthlyRevenue: 19200,
    });
  });

  it("keeps the projection unavailable without a revenue baseline", () => {
    expect(buildRevenueProjection({
      cashContractedTotal: 0,
      monthsCount: 4,
      bottleneckGain: 3000,
      leverGains: [1000],
    })).toEqual({
      averageMonthlyRevenue: null,
      bottleneckGain: 3000,
      optimizedMonthlyRevenue: null,
      topLeverGains: [1000],
      potentialMonthlyRevenue: null,
    });
  });
});
