import { describe, expect, it } from "vitest";

import {
  appendStripeSubscriptionCharge,
  applyStripeChargeToSale,
  matchStripeCharge,
  type ReconciliationSale,
  type StripeChargeForReconciliation,
} from "./reconcile-sales";

const baseInstallment = {
  amount: 500,
  dueDate: "2026-07-01",
  status: "upcoming" as const,
  paidAt: null,
  stripeChargeId: null,
  failureReason: null,
  acknowledgedAt: null,
};

function sale(overrides: Partial<ReconciliationSale> = {}): ReconciliationSale {
  return {
    id: "sale_1",
    clientEmail: "client@example.com",
    totalPrice: 500,
    paymentType: "installments",
    paymentMethod: "stripe",
    installments: [{ ...baseInstallment }],
    stripeCustomerId: null,
    isOrphan: false,
    ...overrides,
  };
}

function charge(overrides: Partial<StripeChargeForReconciliation> = {}): StripeChargeForReconciliation {
  return {
    id: "ch_1",
    status: "succeeded",
    amountEur: 500,
    createdAt: "2026-07-01",
    email: "client@example.com",
    clientName: "Client",
    customerId: null,
    isSubscription: false,
    isRefunded: false,
    failureReason: null,
    ...overrides,
  };
}

describe("matchStripeCharge", () => {
  it("matches one unpaid installment by email and amount", () => {
    const result = matchStripeCharge(charge(), [sale()]);

    expect(result).toEqual({ kind: "matched", saleId: "sale_1", installmentIndex: 0 });
    if (result.kind !== "matched") return;

    const updated = applyStripeChargeToSale(sale(), charge(), result.installmentIndex);
    expect(updated.installments?.[0].status).toBe("paid");
    expect(updated.installments?.[0].stripeChargeId).toBe("ch_1");
  });

  it("refuses to merge when two deals are candidates", () => {
    const result = matchStripeCharge(charge(), [sale(), sale({ id: "sale_2" })]);

    expect(result).toEqual({ kind: "ambiguous", saleIds: ["sale_1", "sale_2"] });
  });

  it("attaches a recurring charge by Stripe customer, not amount", () => {
    const subscription = sale({
      paymentType: "subscription",
      stripeCustomerId: "cus_1",
      installments: [],
    });
    const result = matchStripeCharge(
      charge({ amountEur: 99, email: "different@example.com", customerId: "cus_1", isSubscription: true }),
      [subscription]
    );

    expect(result).toEqual({ kind: "subscription", saleId: "sale_1" });
    if (result.kind !== "subscription") return;

    const updated = appendStripeSubscriptionCharge(subscription, charge({ amountEur: 99, customerId: "cus_1", isSubscription: true }));
    expect(updated.installments).toHaveLength(1);
    expect(updated.installments?.[0].amount).toBe(99);
  });

  it("writes refunded on the installment that already contains the charge", () => {
    const paidSale = sale({
      installments: [{ ...baseInstallment, status: "paid", stripeChargeId: "ch_1", paidAt: "2026-07-01" }],
    });
    const result = matchStripeCharge(charge({ isRefunded: true }), [paidSale]);

    expect(result).toEqual({ kind: "already_recorded", saleId: "sale_1", installmentIndex: 0 });
    if (result.kind !== "already_recorded") return;

    const updated = applyStripeChargeToSale(paidSale, charge({ isRefunded: true }), result.installmentIndex);
    expect(updated.installments?.[0].status).toBe("refunded");
  });

  it("skips a charge id that is already recorded", () => {
    const paidSale = sale({
      installments: [{ ...baseInstallment, status: "paid", stripeChargeId: "ch_1", paidAt: "2026-07-01" }],
    });

    expect(matchStripeCharge(charge(), [paidSale])).toEqual({ kind: "already_recorded", saleId: "sale_1", installmentIndex: 0 });
  });
});
