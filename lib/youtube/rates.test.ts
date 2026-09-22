import { describe, expect, it } from "vitest";

import { bookingsPerThousandViews, revenuePerThousandViews, salesPerThousandViews, subscribersPerThousandViews } from "./rates";

describe("YouTube derived rates", () => {
  it("calculates rates from views without storing derived values", () => {
    expect(subscribersPerThousandViews({ views: 2500, subscribersGained: 12, subscribersLost: 2 })).toBe(4);
    expect(bookingsPerThousandViews(3, 2000)).toBe(1.5);
    expect(salesPerThousandViews(2, 2000)).toBe(1);
    expect(revenuePerThousandViews(600, 2000)).toBe(300);
  });

  it("returns unavailable when the denominator is missing or zero", () => {
    expect(bookingsPerThousandViews(3, 0)).toBeNull();
    expect(salesPerThousandViews(null, 1000)).toBeNull();
    expect(revenuePerThousandViews(100, null)).toBeNull();
  });
});
