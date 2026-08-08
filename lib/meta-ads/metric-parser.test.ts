import { describe, expect, it } from "vitest";

import { parseMetaInsightMetrics } from "./metric-parser";

describe("Meta insight metric availability", () => {
  it("keeps purchase count available while freezing purchase value without action_values", () => {
    const metrics = parseMetaInsightMetrics({
      spend: "12.50",
      impressions: "1000",
      actions: [{ action_type: "purchase", value: "2" }],
    });

    expect(metrics.purchases).toBe(2);
    expect(metrics.purchaseValueCents).toBe(0);
    expect(metrics.availableMetrics).toContain("meta_action:purchases");
    expect(metrics.availableMetrics).not.toContain("meta_action_value:purchases");
  });

  it("exposes purchase value only when Meta returns an explicit value", () => {
    const metrics = parseMetaInsightMetrics({
      actions: [{ action_type: "purchase", value: "2" }],
      action_values: [{ action_type: "purchase", value: "149.90" }],
    });

    expect(metrics.purchaseValueCents).toBe(14990);
    expect(metrics.availableMetrics).toContain("meta_action_value:purchases");
  });

  it("keeps Meta's raw CTR, CPC and CPM available for period-level provenance", () => {
    const metrics = parseMetaInsightMetrics({
      spend: "12.50",
      impressions: "1000",
      inline_link_clicks: "100",
      ctr: "10",
      cpc: "0.125",
      cpm: "12.5",
    });

    expect(metrics.ctr).toBe(0.1);
    expect(metrics.cpcCents).toBe(12.5);
    expect(metrics.cpmCents).toBe(1250);
    expect(metrics.availableMetrics).toEqual(expect.arrayContaining(["ctr", "cpc", "cpm"]));
  });
});
