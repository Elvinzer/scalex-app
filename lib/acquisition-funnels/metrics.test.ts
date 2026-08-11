import { describe, expect, it } from "vitest";

import { DEFAULT_ACQUISITION_BENCHMARKS, getDefaultAcquisitionFunnel } from "./catalog";
import { buildAdaptiveFunnel } from "./metrics";

describe("adaptive funnel metrics", () => {
  it("calculates a reliable stage gain from the selected journey benchmark", () => {
    const funnel = getDefaultAcquisitionFunnel("lead_magnet");
    const result = buildAdaptiveFunnel({
      entry: funnel,
      stageVolumes: {
        content_views: 1000,
        content_clicks: 200,
        content_leads: 20,
        calls_booked: 4,
        calls_attended: 3,
        sales_closed: 1,
      },
      benchmarks: Object.fromEntries(
        Object.entries(DEFAULT_ACQUISITION_BENCHMARKS.lead_magnet).map(([key, value]) => [`lead_magnet:${key}`, value])
      ),
      dealPrice: 1000,
      revenue: 1000,
    });

    expect(result.stages[1]?.benchmarkRate).toBe(0.25);
    expect(result.stages[1]?.isReliable).toBe(true);
    // The click improvement is propagated through the observed downstream
    // rates: 50 extra clicks become 0.25 extra sales at the end of the funnel.
    expect(result.stages[1]?.monthlyGain).toBe(250);
    // The total is one sequential all-benchmarks scenario, never the sum of
    // independent gains for every stage.
    expect(result.totalPotential).toBe(2150);
    expect(result.catalogKey).toBe("lead_magnet");
  });

  it("does not invent a gain when the sample is below the reliability threshold", () => {
    const funnel = getDefaultAcquisitionFunnel("vsl");
    const result = buildAdaptiveFunnel({
      entry: funnel,
      stageVolumes: { content_views: 20, content_clicks: 1 },
      benchmarks: { "vsl:vsl_click_rate": 0.35 },
      dealPrice: 1000,
      revenue: null,
    });

    expect(result.stages[1]?.monthlyGain).toBeNull();
    expect(result.stages[1]?.noteKey).toBe("volumeInsufficient");
  });
});
