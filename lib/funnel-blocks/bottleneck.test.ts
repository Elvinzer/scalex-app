import { describe, expect, it } from "vitest";

import { DEFAULT_FUNNEL_BLOCKS } from "./catalog";
import { buildFunnelBlockBottleneck } from "./bottleneck";

describe("buildFunnelBlockBottleneck", () => {
  it("uses the selected block sequence, benchmarks and measured volumes", () => {
    const result = buildFunnelBlockBottleneck({
      selection: {
        blocks: [
          { blockKey: "lead_magnet", order: 1 },
          { blockKey: "appel", order: 2 },
        ],
        sources: ["organique"],
        inferred: false,
      },
      catalog: DEFAULT_FUNNEL_BLOCKS,
      row: null,
      benchmarks: {
        "lead_magnet:optin_rate": 0.2,
        "appel:show_up_rate": 0.6,
        "appel:closing_rate": 0.3,
      },
      metricValues: {
        lead_magnet_clicks: 100,
        lead_magnet_optins: 10,
        calls_booked: 5,
        calls_attended: 3,
        sales_closed: 1,
      },
      source: "total",
      dealPrice: 1000,
      revenue: 1000,
      sales: 1,
      catalogLabel: "Assembled journey",
    });

    expect(result.stages.map((stage) => stage.volume)).toEqual([100, 10, 5, 3, 1]);
    expect(result.stages[1]?.currentRate).toBe(0.1);
    expect(result.stages[1]?.benchmarkRate).toBe(0.2);
    expect(result.bottleneckId).toBe("lead_magnet:lead_magnet_optins");
    expect(result.totalPotential).toBeGreaterThan(0);
    expect(result.sales).toBe(1);
  });
});
