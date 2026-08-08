import { describe, expect, it } from "vitest";

import { sumChiffrableMonthlyGains } from "./monthly-gap";

describe("sumChiffrableMonthlyGains", () => {
  it("additionne les gains des points et des améliorations", () => {
    expect(sumChiffrableMonthlyGains([1200, 850, 450])).toBe(2500);
  });

  it("ignore uniquement les opportunités non chiffrables", () => {
    expect(sumChiffrableMonthlyGains([1200, null, undefined, 300])).toBe(1500);
  });
});
