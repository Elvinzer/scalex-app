import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, selectResults, valuesMock, upsertMock } = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: upsertMock }));
  const upsertMock = vi.fn();
  const dbMock = {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResults.shift() ?? [],
        }),
      }),
    })),
    insert: vi.fn(() => ({ values: valuesMock })),
  };
  return { dbMock, selectResults, valuesMock, upsertMock };
});

vi.mock("@/db", () => ({ db: dbMock }));

import { parseStripeSubscription, syncStripeSubscriptionProjection } from "./stripe-subscription";

const userId = "00000000-0000-0000-0000-000000000001";
const planId = "00000000-0000-0000-0000-000000000002";

beforeEach(() => {
  selectResults.length = 0;
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  valuesMock.mockClear();
  upsertMock.mockClear();
});

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

  it("does not infer a monthly amount from a known non-monthly Price", () => {
    const result = parseStripeSubscription({
      id: "sub_annual",
      customer: "cus_annual",
      status: "active",
      cancel_at_period_end: false,
      metadata: { userId, planId, priceMonthlyCents: "9900" },
      items: {
        data: [{ price: { id: "price_annual", unit_amount: 99000, recurring: { interval: "year" } } }],
      },
    });

    expect(result?.stripePriceId).toBe("price_annual");
    expect(result?.priceMonthlyCents).toBeNull();
  });

  it("rejects a payload whose items do not contain a recurring Price", () => {
    expect(parseStripeSubscription({
      id: "sub_one_time",
      customer: "cus_one_time",
      status: "active",
      cancel_at_period_end: false,
      metadata: { userId, planId, priceMonthlyCents: "9900" },
      items: {
        data: [{ price: { id: "price_one_time", unit_amount: 9900, recurring: null } }],
      },
    })).toBeNull();
  });

  it("rejects a subscription without Minaly ownership metadata", () => {
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

  it("upserts the exact Price projection when the account and plan agree", async () => {
    selectResults.push([], [{ id: planId }], [{ id: planId }]);

    const result = await syncStripeSubscriptionProjection({
      id: "sub_sync",
      customer: "cus_sync",
      status: "active",
      cancel_at_period_end: false,
      current_period_end: 1_790_000_000,
      metadata: { userId, planId },
      items: {
        data: [{ price: { id: "price_sync", unit_amount: 12900, recurring: { interval: "month" } } }],
      },
    }, userId);

    expect(result).toMatchObject({ ok: true, planId });
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({
      userId,
      planId,
      stripePriceId: "price_sync",
      priceMonthlyCents: 12900,
    }));
    expect(upsertMock).toHaveBeenCalledOnce();
  });

  it("preserves the existing projection when the Price resolves to another plan", async () => {
    selectResults.push([], [{ id: "00000000-0000-0000-0000-000000000003" }]);

    const result = await syncStripeSubscriptionProjection({
      id: "sub_plan_conflict",
      customer: "cus_conflict",
      status: "active",
      cancel_at_period_end: false,
      metadata: { userId, planId },
      items: {
        data: [{ price: { id: "price_other", unit_amount: 24900, recurring: { interval: "month" } } }],
      },
    }, userId);

    expect(result).toEqual({
      ok: false,
      code: "conflict",
      error: "Le Price Stripe ne correspond pas au plan déclaré par cet abonnement.",
    });
    expect(valuesMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("rejects an account mismatch before touching the local projection", async () => {
    const result = await syncStripeSubscriptionProjection({
      id: "sub_account_mismatch",
      customer: "cus_other",
      status: "active",
      cancel_at_period_end: false,
      metadata: { userId, planId },
      items: { data: [{ price: "price_other" }] },
    }, "00000000-0000-0000-0000-000000000004");

    expect(result).toMatchObject({ ok: false, code: "mismatch" });
    expect(valuesMock).not.toHaveBeenCalled();
  });
});
