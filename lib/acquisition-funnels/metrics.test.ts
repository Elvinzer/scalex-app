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
    // The total is one sequential scenario, never the sum of independent
    // gains, and is conservatively bounded by the value of measured sales.
    expect(result.totalPotential).toBe(1000);
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

  it("does not mix a missing audience period with downstream funnel data", () => {
    const funnel = getDefaultAcquisitionFunnel("vsl");
    const result = buildAdaptiveFunnel({
      entry: funnel,
      stageVolumes: {
        content_views: null,
        content_clicks: 345,
        vsl_views: 280,
        calls_booked: 89,
        calls_attended: 74,
        sales_closed: 34,
      },
      benchmarks: { "vsl:vsl_click_rate": 0.35, "vsl:vsl_view_rate": 0.5 },
      dealPrice: 2700,
      revenue: null,
    });

    expect(result.stages[1]?.monthlyGain).toBeNull();
    expect(result.stages[1]?.noteKey).toBe("sourceIncomplete");
    expect(result.totalPotential).toBeNull();
    expect(result.bottleneckId).toBeNull();
  });

  it("caps an unattributed top-of-funnel projection at measured sales value", () => {
    const funnel = getDefaultAcquisitionFunnel("vsl");
    const result = buildAdaptiveFunnel({
      entry: funnel,
      stageVolumes: {
        content_views: 10_760,
        content_clicks: 345,
        vsl_views: 280,
        calls_booked: 89,
        calls_attended: 74,
        sales_closed: 34,
      },
      benchmarks: {
        "vsl:vsl_click_rate": 0.35,
        "vsl:vsl_view_rate": 0.5,
        "vsl:vsl_booking_rate": 0.35,
        "vsl:vsl_show_up_rate": 0.6,
        "vsl:vsl_closing_rate": 0.3,
      },
      dealPrice: 2700,
      revenue: null,
    });

    expect(result.stages[1]?.monthlyGain).toBe(91_800);
    expect(result.stages[1]?.noteKey).toBe("gainCapped");
    expect(result.totalPotential).toBe(91_800);
  });
});
