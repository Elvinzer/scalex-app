import { describe, expect, it } from "vitest";

import { calculateFreeDiagnostic, type FreeDiagnosticInput } from "./free-diagnostic";

function input(overrides: Partial<FreeDiagnosticInput> = {}): FreeDiagnosticInput {
  return {
    niche: "Coaching business",
    offer: "Programme croissance",
    price: 1500,
    audience: 10_000,
    leads: 100,
    appointments: 10,
    sales: 2,
    revenue: 3000,
    ...overrides,
  };
}

describe("calculateFreeDiagnostic", () => {
  it("identifies the weakest measured step and estimates its monthly gap", () => {
    expect(calculateFreeDiagnostic(input())).toEqual({
      score: 56,
      bottleneck: "acquisition",
      currentRate: 0.01,
      benchmarkRate: 0.05,
      estimatedGain: 2400,
      measuredSignals: 3,
    });
  });

  it("uses only calculable rates when a base metric is missing", () => {
    expect(calculateFreeDiagnostic(input({ audience: null, revenue: null, leads: 100, appointments: 20, sales: 5, price: 1000 }))).toEqual({
      score: 100,
      bottleneck: "conversion",
      currentRate: 0.25,
      benchmarkRate: 0.25,
      estimatedGain: 0,
      measuredSignals: 2,
    });
  });

  it("returns an empty result instead of inventing a bottleneck", () => {
    expect(calculateFreeDiagnostic(input({ audience: null, leads: null, appointments: null, sales: null, revenue: null }))).toEqual({
      score: null,
      bottleneck: null,
      currentRate: null,
      benchmarkRate: null,
      estimatedGain: null,
      measuredSignals: 0,
    });
  });
});
