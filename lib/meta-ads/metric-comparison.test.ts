import { describe, expect, it } from "vitest";

import { relativeChange, trendLabel } from "./metric-comparison";

describe("Meta metric comparison", () => {
  it("computes a relative change only when the comparison base is usable", () => {
    expect(relativeChange(120, 100)).toBeCloseTo(0.2);
    expect(relativeChange(80, 100)).toBeCloseTo(-0.2);
    expect(relativeChange(10, 0)).toBeNull();
    expect(relativeChange(null, 100)).toBeNull();
  });

  it("explains unavailable and zero-base comparisons instead of inventing a percentage", () => {
    expect(trendLabel(null, 100)).toContain("comparaison indisponible");
    expect(trendLabel(0, 0)).toContain("stable");
    expect(trendLabel(10, 0)).toContain("nouvelle base");
    expect(trendLabel(120, 100)).toContain("+20%");
  });
});
