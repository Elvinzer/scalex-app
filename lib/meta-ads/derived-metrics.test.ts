import { describe, expect, it } from "vitest";

import { safeRatio } from "./derived-metrics";

describe("Meta derived metric ratios", () => {
  it("returns a deterministic ratio for a usable denominator", () => {
    expect(safeRatio(25, 100)).toBe(0.25);
  });

  it("keeps missing and zero-denominator values unavailable", () => {
    expect(safeRatio(null, 100)).toBeNull();
    expect(safeRatio(25, null)).toBeNull();
    expect(safeRatio(0, 0)).toBeNull();
  });
});
