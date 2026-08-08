import { describe, expect, it } from "vitest";

import { formatSignedPercent, targetVariance, targetVarianceLabel } from "./targets";

describe("Meta Ads business targets", () => {
  it("computes a relative gap without judging the result", () => {
    expect(targetVariance(40, 35)).toBeCloseTo(5 / 35);
    expect(formatSignedPercent(targetVariance(40, 35))).toBe("+14%");
    expect(targetVarianceLabel(40, 35)).toBe("écart +14%");
  });

  it("preserves a negative gap when the actual value is below target", () => {
    expect(formatSignedPercent(targetVariance(0.8, 1))).toBe("-20%");
  });

  it("does not invent a gap for missing or unusable values", () => {
    expect(targetVariance(null, 35)).toBeNull();
    expect(targetVariance(40, null)).toBeNull();
    expect(targetVariance(40, 0)).toBeNull();
    expect(targetVarianceLabel(null, 35)).toBe("écart non calculable");
    expect(targetVarianceLabel(40, null)).toBeNull();
  });
});
