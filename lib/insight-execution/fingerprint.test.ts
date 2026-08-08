import { describe, expect, it } from "vitest";

import { fingerprintInsight } from "./fingerprint";

describe("insight fingerprint", () => {
  it("is stable when snapshot keys arrive in a different order", () => {
    const first = fingerprintInsight({
      sourceType: "diagnostic_metric",
      sourceId: "closingRate",
      metricKey: "closingRate",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      snapshot: { current: 12, benchmark: 20 },
    });
    const second = fingerprintInsight({
      sourceType: "diagnostic_metric",
      sourceId: "closingRate",
      metricKey: "closingRate",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      snapshot: { benchmark: 20, current: 12 },
    });

    expect(first).toBe(second);
  });

  it("changes when the source snapshot changes", () => {
    const input = {
      sourceType: "diagnostic_metric",
      sourceId: "closingRate",
      metricKey: "closingRate",
      periodStart: "2026-01-01",
      periodEnd: "2026-03-31",
      snapshot: { current: 12 },
    };
    expect(fingerprintInsight(input)).not.toBe(fingerprintInsight({ ...input, snapshot: { current: 18 } }));
  });
});
