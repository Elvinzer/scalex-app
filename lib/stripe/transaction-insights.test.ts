import { describe, expect, it } from "vitest";

import type { ResolvedPeriod } from "@/lib/period";

import {
  buildStripeFailureSignal,
  buildStripeInsightSignals,
  buildStripeInsightSnapshot,
  buildStripeTrend,
  type StripeInsightRefund,
  type StripeInsightTransaction,
} from "./transaction-insights";

const julyPeriod: ResolvedPeriod = {
  key: "last_30d",
  start: new Date("2026-07-01T00:00:00Z"),
  end: new Date("2026-08-01T00:00:00Z"),
};

const yearPeriod: ResolvedPeriod = {
  key: "this_year",
  start: new Date("2026-01-01T00:00:00Z"),
  end: new Date("2027-01-01T00:00:00Z"),
};

function transaction(overrides: Partial<StripeInsightTransaction> = {}): StripeInsightTransaction {
  return {
    id: "ch_default",
    stripeAccountId: "acct_1",
    amountCents: 10_000,
    amountRefundedCents: 0,
    currency: "eur",
    status: "succeeded",
    paymentType: "one_shot",
    customerId: "cus_default",
    occurredAt: "2026-07-15T12:00:00Z",
    ...overrides,
  };
}

function refund(overrides: Partial<StripeInsightRefund> = {}): StripeInsightRefund {
  return {
    id: "re_default",
    stripeAccountId: "acct_1",
    stripeChargeId: "ch_default",
    amountCents: 2_000,
    currency: "eur",
    status: "succeeded",
    occurredAt: "2026-07-20T12:00:00Z",
    ...overrides,
  };
}

describe("buildStripeInsightSnapshot", () => {
  it("calcule le net avec un remboursement partiel et le risque des échecs", () => {
    const snapshot = buildStripeInsightSnapshot(
      [
        transaction({ id: "ch_paid", amountCents: 10_000 }),
        transaction({ id: "ch_failed", amountCents: 5_000, status: "failed", customerId: null }),
        transaction({ id: "ch_pending", amountCents: 3_000, status: "pending" }),
      ],
      [refund()],
      julyPeriod,
      "eur",
      7_000,
    );

    expect(snapshot.grossCents).toBe(10_000);
    expect(snapshot.refundsCents).toBe(2_000);
    expect(snapshot.netCents).toBe(8_000);
    expect(snapshot.successfulTransactions).toBe(1);
    expect(snapshot.failedTransactions).toBe(1);
    expect(snapshot.pendingTransactions).toBe(1);
    expect(snapshot.amountAtRiskCents).toBe(12_000);
    expect(snapshot.averageTicketCents).toBe(10_000);
    expect(snapshot.refundRatePct).toBe(20);
  });

  it("ne mélange pas les devises et ne fabrique pas de pourcentage sur une période précédente nulle", () => {
    const snapshot = buildStripeInsightSnapshot(
      [
        transaction({ id: "ch_eur", amountCents: 10_000, currency: "eur", occurredAt: "2026-07-10T12:00:00Z" }),
        transaction({ id: "ch_usd", amountCents: 99_000, currency: "usd", occurredAt: "2026-07-10T12:00:00Z" }),
      ],
      [],
      yearPeriod,
      "eur",
    );

    expect(snapshot.grossCents).toBe(10_000);
    expect(snapshot.currency).toBe("eur");
    expect(snapshot.comparison.grossCents.deltaPercent).toBeNull();
    expect(Number.isFinite(snapshot.comparison.grossCents.deltaPercent ?? 0)).toBe(true);
  });

  it("calcule la récurrence, les clients répétés et la concentration", () => {
    const snapshot = buildStripeInsightSnapshot(
      [
        transaction({ id: "ch_1", customerId: "cus_repeat", paymentType: "subscription", amountCents: 10_000 }),
        transaction({ id: "ch_2", customerId: "cus_repeat", paymentType: "subscription", amountCents: 10_000 }),
        transaction({ id: "ch_3", customerId: "cus_other", amountCents: 5_000 }),
        transaction({ id: "ch_4", customerId: "cus_other", amountCents: 5_000 }),
        transaction({ id: "ch_5", customerId: null, amountCents: 5_000 }),
      ],
      [],
      julyPeriod,
      "eur",
    );

    expect(snapshot.uniqueCustomers).toBe(2);
    expect(snapshot.repeatCustomers).toBe(2);
    expect(snapshot.repeatCustomerRatePct).toBe(100);
    expect(snapshot.recurringSharePct).toBeCloseTo(57.14, 2);
    expect(snapshot.topCustomerSharePct).toBeCloseTo(57.14, 2);
    expect(snapshot.customersWithoutId).toBe(1);
  });
});

describe("buildStripeInsightSignals", () => {
  it("expose un avertissement pour un échec même avant le seuil d’un signal", () => {
    const snapshot = buildStripeInsightSnapshot(
      [transaction({ id: "ch_failed", amountCents: 20_000, status: "failed" })],
      [],
      julyPeriod,
      "eur",
    );

    const signal = buildStripeFailureSignal(snapshot, "en");

    expect(signal?.type).toBe("failures");
    expect(signal?.title).toBe("Failed payments need attention");
    expect(signal?.actionHref).toBe("#failed-payments");
  });

  it("retient les signaux avec preuve et garde d'échantillon", () => {
    const transactions = Array.from({ length: 6 }, (_, index) =>
      transaction({ id: `ch_${index}`, amountCents: 10_000, status: index === 0 ? "failed" : "succeeded" }),
    );
    const snapshot = buildStripeInsightSnapshot(
      transactions,
      Array.from({ length: 2 }, (_, index) => refund({ id: `re_${index}`, amountCents: 2_000 })),
      julyPeriod,
      "eur",
    );
    const signals = buildStripeInsightSignals(snapshot);

    expect(signals.some((signal) => signal.type === "refunds")).toBe(true);
    expect(signals.some((signal) => signal.type === "failures")).toBe(true);
    expect(signals.every((signal) => signal.evidence.length > 0)).toBe(true);

    const insufficient = buildStripeInsightSignals(
      buildStripeInsightSnapshot(
        Array.from({ length: 4 }, (_, index) => transaction({ id: `small_${index}` })),
        Array.from({ length: 4 }, (_, index) => refund({ id: `small_re_${index}`, amountCents: 10_000 })),
        julyPeriod,
        "eur",
      ),
    );
    expect(insufficient.some((signal) => signal.type === "refunds")).toBe(false);
  });

  it("retourne un état explicite quand la période est vide", () => {
    const signals = buildStripeInsightSignals(
      buildStripeInsightSnapshot([], [], julyPeriod, "eur"),
    );
    expect(signals).toHaveLength(1);
    expect(signals[0]?.type).toBe("insufficient_data");
  });

  it("reste fini avec des montants extrêmes ou négatifs", () => {
    const snapshot = buildStripeInsightSnapshot(
      [
        transaction({ id: "extreme", amountCents: Number.MAX_SAFE_INTEGER }),
        transaction({ id: "negative", amountCents: -50 }),
      ],
      [refund({ amountCents: Number.MAX_SAFE_INTEGER })],
      julyPeriod,
      "eur",
    );
    expect(snapshot.grossCents).toBe(Number.MAX_SAFE_INTEGER);
    expect(snapshot.netCents).toBe(0);
    expect(Number.isFinite(snapshot.refundRatePct ?? 0)).toBe(true);
  });
});

describe("buildStripeTrend", () => {
  it("construit des mois visibles et impute le remboursement au mois du remboursement", () => {
    const trend = buildStripeTrend(
      [transaction({ occurredAt: "2026-06-10T12:00:00Z", amountCents: 10_000 })],
      [refund({ occurredAt: "2026-07-05T12:00:00Z", amountCents: 2_000 })],
      { key: "all", start: null, end: null },
      "eur",
    );

    expect(trend).toHaveLength(2);
    expect(trend[0]?.grossCents).toBe(10_000);
    expect(trend[0]?.refundsCents).toBe(0);
    expect(trend[1]?.refundsCents).toBe(2_000);
    expect(trend[1]?.netCents).toBe(-2_000);
  });
});
