import { describe, expect, it } from "vitest";

import { calculateCommission, formatRateBps, referralCodeSchema } from "./schema";

describe("referral calculations", () => {
  it("calculates a lifetime commission in integer cents", () => {
    expect(calculateCommission(10_000, 1_000)).toBe(1_000);
    expect(calculateCommission(999, 333)).toBe(33);
  });

  it("never creates a commission from an invalid or empty base", () => {
    expect(calculateCommission(0, 1_000)).toBe(0);
    expect(calculateCommission(-100, 1_000)).toBe(0);
    expect(calculateCommission(10_000, 0)).toBe(0);
  });

  it("normalizes public codes and renders basis-point rates", () => {
    expect(referralCodeSchema.parse(" cedric-x ")).toBe("CEDRIC-X");
    expect(formatRateBps(1_000)).toBe("10 %");
    expect(formatRateBps(1_025)).toBe("10.25 %");
  });
});
