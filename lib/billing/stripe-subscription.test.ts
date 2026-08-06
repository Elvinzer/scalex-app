import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { parseStripeSubscription } from "./stripe-subscription";

const userId = "00000000-0000-0000-0000-000000000001";
const planId = "00000000-0000-0000-0000-000000000002";

describe("Stripe subscription projection parser", () => {
  it("reads the exact recurring Price and period from a Stripe payload", () => {
    const result = parseStripeSubscription({
      id: "sub_123",
      customer: "cus_123",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: 1_790_000_000,
      metadata: { userId, planId, priceMonthlyCents: "4900", stripePriceId: "price_123" },
      items: {
        data: [
          {
            current_period_end: 1_790_000_000,
            price: {
              id: "price_123",
              unit_amount: 4900,
              recurring: { interval: "month" },
            },
          },
        ],
      },
    });

    expect(result).toMatchObject({
      userId,
      metadataPlanId: planId,
      stripeSubscriptionId: "sub_123",
      stripeCustomerId: "cus_123",
      stripePriceId: "price_123",
      priceMonthlyCents: 4900,
      status: "active",
      cancelAtPeriodEnd: false,
    });
    expect(result?.currentPeriodEnd).toEqual(new Date(1_790_000_000 * 1000));
  });

  it("falls back to the checkout metadata when Stripe only sends a Price id", () => {
    const result = parseStripeSubscription({
      id: "sub_legacy",
      customer: { id: "cus_legacy" },
      status: "trialing",
      cancel_at_period_end: true,
      metadata: { userId, planId, priceMonthlyCents: "9900" },
      items: { data: [{ price: "price_legacy" }] },
    });

    expect(result?.stripePriceId).toBe("price_legacy");
    expect(result?.priceMonthlyCents).toBe(9900);
    expect(result?.stripeCustomerId).toBe("cus_legacy");
  });

  it("rejects a subscription without Scale X ownership metadata", () => {
    expect(
      parseStripeSubscription({
        id: "sub_unrelated",
        customer: "cus_unrelated",
        status: "active",
        cancel_at_period_end: false,
        metadata: {},
        items: { data: [{ price: "price_unrelated" }] },
      })
    ).toBeNull();
  });
});
