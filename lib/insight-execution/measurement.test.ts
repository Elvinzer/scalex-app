import { describe, expect, it } from "vitest";

import { compareBaselineSnapshots, measurementEvidenceLabel } from "./measurement";
import type { BaselineSnapshot } from "./types";

const baseline: BaselineSnapshot = {
  metricKey: "closingRate",
  unit: "fraction",
  value: 0.12,
  benchmarkValue: 0.2,
  periodStart: "2026-01-01",
  periodEnd: "2026-03-31",
  sampleSize: 30,
  source: "diagnostic_kpi",
  freshness: "2026-04-01T00:00:00.000Z",
  cashValueEur: 12000,
};

describe("insight measurement", () => {
  it("calculates the before/after delta in the stored unit and cash variation", () => {
    const result = compareBaselineSnapshots(baseline, {
      ...baseline,
      value: 0.18,
      periodStart: "2026-04-01",
      periodEnd: "2026-06-30",
      freshness: "2026-07-01T00:00:00.000Z",
      cashValueEur: 14500,
    });

    expect(result?.beforeValue).toBe(0.12);
    expect(result?.afterValue).toBe(0.18);
    expect(result?.deltaValue).toBeCloseTo(0.06);
    expect(result?.cashImpactEur).toBe(2500);
    expect(result?.evidence).toBe("observed");
  });

  it("rejects a different metric instead of presenting a false causal result", () => {
    expect(compareBaselineSnapshots(baseline, { ...baseline, metricKey: "responseRate" })).toBeNull();
    expect(compareBaselineSnapshots(baseline, { ...baseline, unit: "eur", value: 14500 })).toBeNull();
  });

  it("keeps evidence labels explicit", () => {
    expect(measurementEvidenceLabel("observed")).toBe("Impact observé");
    expect(measurementEvidenceLabel("estimated")).toBe("Gain estimé post-action");
    expect(measurementEvidenceLabel("not_calculable")).toBe("Non calculable");
    expect(measurementEvidenceLabel("qualitative")).toBe("Observation utilisateur");
  });
});
