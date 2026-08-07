import { describe, expect, it } from "vitest";

import { generateSchedule, summarize } from "./installments";

describe("sale installment totals", () => {
  it("counts a three-payment deal once for contracted revenue", () => {
    const installments = generateSchedule(1500, 3, "2026-07-01").map((installment, index) =>
      index === 0 ? { ...installment, status: "paid" as const, paidAt: "2026-07-01" } : installment
    );
    const deals = [{ totalPrice: 1500, installments }];

    const contracted = deals.reduce((total, deal) => total + deal.totalPrice, 0);
    const summary = summarize(deals[0].totalPrice, deals[0].installments);

    expect(contracted).toBe(1500);
    expect(summary.paidTotal).toBe(500);
    expect(summary.pendingTotal).toBe(1000);
  });
});
