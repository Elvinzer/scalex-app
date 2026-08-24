import { describe, expect, it } from "vitest";

import { monthlyMetricsInputSchema } from "./schema";

const emptyMonthlyMetrics = {
  cashCollected: null,
  cashContracted: null,
  newFollowers: null,
  firstMessages: null,
  conversations: null,
  callsProposed: null,
  callsBooked: null,
  callsTaken: null,
  salesClosed: null,
};

describe("monthlyMetricsInputSchema", () => {
  it("accepts decimal revenue amounts while keeping count fields integer-only", () => {
    const parsed = monthlyMetricsInputSchema.safeParse({
      ...emptyMonthlyMetrics,
      cashCollected: 1000.5,
      cashContracted: 1250.75,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects decimal values for count fields", () => {
    const parsed = monthlyMetricsInputSchema.safeParse({
      ...emptyMonthlyMetrics,
      cashCollected: 1000.5,
      callsBooked: 2.5,
    });

    expect(parsed.success).toBe(false);
  });
});
