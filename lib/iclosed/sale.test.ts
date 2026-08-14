import { describe, expect, it } from "vitest";

import { buildSaleInput } from "./sale";

const baseCall = {
  inviteeName: "Client Test",
  inviteeEmail: "client@example.com",
  closer: "Closer Test",
  setterId: null,
  saleDate: "2026-08-14",
};

describe("buildSaleInput", () => {
  it("keeps a three-payment plan when the first payment was collected", () => {
    const sale = buildSaleInput({
      ...baseCall,
      contracted: 3000,
      collected: 1000,
      paymentType: "installments",
      installmentCount: 3,
    });

    expect(sale.paymentType).toBe("installments");
    expect(sale.installments).toHaveLength(3);
    expect(sale.installments?.map((installment) => installment.amount)).toEqual([1000, 1000, 1000]);
    expect(sale.installments?.map((installment) => installment.status)).toEqual(["paid", "upcoming", "upcoming"]);
  });

  it("keeps every installment when a three-payment plan is fully collected", () => {
    const sale = buildSaleInput({
      ...baseCall,
      contracted: 3000,
      collected: 3000,
      paymentType: "installments",
      installmentCount: 3,
    });

    expect(sale.paymentType).toBe("installments");
    expect(sale.installments).toHaveLength(3);
    expect(sale.installments?.every((installment) => installment.status === "paid")).toBe(true);
  });

  it("preserves the legacy two-row schedule when no count is provided", () => {
    const sale = buildSaleInput({ ...baseCall, contracted: 2000, collected: 500 });

    expect(sale.paymentType).toBe("installments");
    expect(sale.installments).toHaveLength(2);
    expect(sale.installments?.[0]?.amount).toBe(500);
    expect(sale.installments?.[1]?.amount).toBe(1500);
  });
});
