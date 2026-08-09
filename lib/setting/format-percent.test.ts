import { describe, expect, it } from "vitest";

import { formatPercent } from "./funnel";

describe("formatPercent", () => {
  it("keeps whole percents integer", () => {
    expect(formatPercent(0.544)).toBe("54%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
  });

  it("does not flatten a sub-1% rate to 0%", () => {
    // The views-denominated content rates live here: 0,09% vs 0,15% has to
    // stay legible as a gap, not render as "0% vs 0%".
    expect(formatPercent(0.0009)).toBe("0,09%");
    expect(formatPercent(0.0015)).toBe("0,15%");
  });
});
