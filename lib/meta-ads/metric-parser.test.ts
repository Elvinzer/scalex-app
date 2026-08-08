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
});
