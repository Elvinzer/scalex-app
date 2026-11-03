import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock, selectResults, valuesMock, upsertMock } = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const valuesMock = vi.fn(() => ({ onConflictDoUpdate: upsertMock }));
  const upsertMock = vi.fn();
  const dbMock = {
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => callback(dbMock)),
    execute: vi.fn(async () => undefined),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: async () => selectResults.shift() ?? [],
        }),
      }),
    })),
    insert: vi.fn(() => ({ values: valuesMock })),
    update: vi.fn(() => ({ set: () => ({ where: async () => undefined }) })),
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
    selectResults.push([{ id: userId, stripeCustomerId: "cus_sync" }], [], [{ id: planId }], [{ id: planId }]);

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
    selectResults.push([{ id: userId, stripeCustomerId: "cus_conflict" }], [], [{ id: "00000000-0000-0000-0000-000000000003" }]);

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
      error: "Subscription price does not match its plan.",
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

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_current", customer: "cus_current", status: "active", cancel_at_period_end: false,
    current_period_end: Math.floor(Date.now() / 1000) + 86_400,
    metadata: { businessId: userId, planId },
    items: { data: [{ price: { id: "price_current", unit_amount: 7900, recurring: { interval: "month" } } }] },
    ...overrides,
  };
}

function arrange(existing: Record<string, unknown>[] = []) {
  selectResults.push([{ id: userId, stripeCustomerId: "cus_current" }], existing, [{ id: planId }], [{ id: planId }]);
}

describe("business subscription ownership and payment recovery", () => {
  it("accepts a business identity without legacy user metadata", () => {
    expect(parseStripeSubscription(subscription())?.userId).toBe(userId);
  });

  it("blocks an attempted unpaid invoice even when the subscription says active", async () => {
    arrange();
    const result = await syncStripeSubscriptionProjection(subscription({ latest_invoice: {
      id: "in_failed", status: "open", paid: false, amount_remaining: 7900, attempt_count: 1,
    } }), undefined, { failedInvoiceId: "in_failed" });
    expect(result).toMatchObject({ ok: true, becameActive: false });
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ latestInvoiceId: "in_failed", paymentBlockedAt: expect.any(Date) }));
  });

  it("does not mistake an open invoice with a processing payment for a failed payment", async () => {
    arrange();
    const result = await syncStripeSubscriptionProjection(subscription({ latest_invoice: {
      id: "in_processing", status: "open", paid: false, amount_remaining: 7900, attempt_count: 1,
    } }));
    expect(result).toMatchObject({ ok: true, becameActive: true });
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ paymentBlockedAt: null }));
  });

  it("clears a previous failure only after the latest invoice is paid", async () => {
    arrange([{ userId, planId, stripeSubscriptionId: "sub_current", status: "active", paymentBlockedAt: new Date(), latestInvoiceId: "in_failed" }]);
    const result = await syncStripeSubscriptionProjection(subscription({ latest_invoice: {
      id: "in_failed", status: "paid", paid: true, amount_remaining: 0, attempt_count: 2,
    } }));
    expect(result).toMatchObject({ ok: true, becameActive: true });
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ paymentBlockedAt: null }));
  });

  it("does not clear a failure from an unexpanded invoice reference", async () => {
    const failedAt = new Date();
    arrange([{ userId, planId, stripeSubscriptionId: "sub_current", status: "active", paymentBlockedAt: failedAt }]);
    await syncStripeSubscriptionProjection(subscription({ latest_invoice: "in_failed" }));
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ paymentBlockedAt: failedAt }));
  });

  it("rejects a customer from another business before changing local billing", async () => {
    selectResults.push([{ id: userId, stripeCustomerId: "cus_someone_else" }]);
    expect(await syncStripeSubscriptionProjection(subscription())).toMatchObject({ ok: false, code: "conflict" });
    expect(valuesMock).not.toHaveBeenCalled();
  });

  it("rejects a second live subscription for the same business", async () => {
    arrange([{ userId, planId, stripeSubscriptionId: "sub_existing", status: "active" }]);
    expect(await syncStripeSubscriptionProjection(subscription())).toMatchObject({ ok: false, code: "conflict" });
    expect(valuesMock).not.toHaveBeenCalled();
  });

  it("ignores cancellation of an old subscription without overwriting its replacement", async () => {
    arrange([{ userId, planId, stripeSubscriptionId: "sub_replacement", status: "active" }]);
    expect(await syncStripeSubscriptionProjection(subscription({ status: "canceled" }))).toMatchObject({ ok: true, applied: false });
    expect(valuesMock).not.toHaveBeenCalled();
  });

  it("refreshes canonical state inside the transaction before applying an old event", async () => {
    arrange();
    const refresh = vi.fn(async () => subscription({ status: "past_due" }));
    await syncStripeSubscriptionProjection(subscription(), undefined, { refresh });
    expect(refresh).toHaveBeenCalledOnce();
    expect(valuesMock).toHaveBeenCalledWith(expect.objectContaining({ status: "past_due" }));
  });
});
