import { describe, expect, it, vi } from "vitest";

// The normalizers are pure, but their module also exports the database-backed
// sync function. Keep this unit suite independent from DATABASE_URL.
vi.mock("@/db", () => ({ db: {} }));

import { normalizeStripeCharge, normalizeStripeRefund } from "./transaction-sync";

const baseCharge = {
  id: "ch_123",
  amount: 10_000,
  amount_refunded: 0,
  currency: "EUR",
  created: 1_752_672_000,
  status: "succeeded",
  customer: "cus_123",
  invoice: "in_123",
  payment_intent: "pi_123",
  billing_details: { name: "Ada Lovelace" },
};

describe("Stripe transaction normalizers", () => {
  it("normalise une charge sans conserver de donnée carte", () => {
    const normalized = normalizeStripeCharge(baseCharge, { stripeAccountId: "acct_123", paymentType: "subscription", customerName: "Ada Lovelace" });

    expect(normalized).toMatchObject({
      stripeChargeId: "ch_123",
      stripeAccountId: "acct_123",
      amountCents: 10_000,
      currency: "eur",
      paymentType: "subscription",
      customerId: "cus_123",
      customerName: "Ada Lovelace",
      invoiceId: "in_123",
      paymentIntentId: "pi_123",
      status: "succeeded",
    });
    expect(normalized).not.toHaveProperty("billing_details");
    expect(normalized).not.toHaveProperty("payment_method_details");
  });

  it("classe les remboursements partiels et totaux sans changer l'identifiant", () => {
    const partial = normalizeStripeCharge(
      { ...baseCharge, amount_refunded: 2_500 },
      { stripeAccountId: "acct_123" },
    );
    const full = normalizeStripeCharge(
      { ...baseCharge, amount_refunded: 10_000, refunded: true },
      { stripeAccountId: "acct_123" },
    );

    expect(partial?.status).toBe("partially_refunded");
    expect(partial?.amountRefundedCents).toBe(2_500);
    expect(full?.status).toBe("refunded");
    expect(full?.id).toBe(partial?.id);
  });

  it("récupère le nom de facturation quand le Customer Stripe n'est pas exploitable", () => {
    const normalized = normalizeStripeCharge(
      { ...baseCharge, customer: null, billing_details: { name: "Grace Hopper" } },
      { stripeAccountId: "acct_123" },
    );

    expect(normalized?.customerId).toBeNull();
    expect(normalized?.customerName).toBe("Grace Hopper");
  });

  it("conserve un échec et un remboursement avec leur devise explicite", () => {
    const failed = normalizeStripeCharge(
      { ...baseCharge, status: "failed", failure_code: "card_declined" },
      { stripeAccountId: "acct_123" },
    );
    const refund = normalizeStripeRefund(
      {
        id: "re_123",
        amount: 2_500,
        currency: "USD",
        created: 1_752_672_000,
        status: "succeeded",
        charge: "ch_123",
        payment_intent: "pi_123",
      },
      { stripeAccountId: "acct_123" },
    );

    expect(failed?.status).toBe("failed");
    expect(failed?.failureCode).toBe("card_declined");
    expect(refund).toMatchObject({ stripeRefundId: "re_123", stripeChargeId: "ch_123", currency: "usd" });
  });

  it("rejette silencieusement un payload Stripe incomplet au bord de la frontière", () => {
    expect(normalizeStripeCharge({ id: "ch_bad", amount: "100" }, { stripeAccountId: "acct_123" })).toBeNull();
    expect(normalizeStripeRefund({ id: "re_bad", amount: 100 }, { stripeAccountId: "acct_123" })).toBeNull();
  });
});
