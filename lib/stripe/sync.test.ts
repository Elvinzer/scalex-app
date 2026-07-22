import { describe, expect, it } from "vitest";

import { aggregateStripeMonths, type StripeChargeRecord, type StripeCustomerRecord, type StripeRefundRecord } from "./sync";

describe("aggregateStripeMonths", () => {
  it("buckets charges by calendar month and sums succeeded amounts", () => {
    const charges: StripeChargeRecord[] = [
      { id: "ch_1", createdAt: new Date("2026-06-25T10:00:00Z"), amountCents: 10000, currency: "eur", customerId: "cus_1" },
      { id: "ch_2", createdAt: new Date("2026-06-30T23:00:00Z"), amountCents: 5000, currency: "eur", customerId: "cus_2" },
      { id: "ch_3", createdAt: new Date("2026-07-01T08:00:00Z"), amountCents: 20000, currency: "eur", customerId: "cus_3" },
    ];
    const months = aggregateStripeMonths(charges, [], [], "UTC");
    const june = months.find((m) => m.month === 6)!;
    const july = months.find((m) => m.month === 7)!;
    expect(june.cashCollectedCents).toBe(15000);
    expect(july.cashCollectedCents).toBe(20000);
  });

  it("attributes a refund to the month it happened in, not the original charge's month (the exact scenario from the brief)", () => {
    const charges: StripeChargeRecord[] = [
      { id: "ch_1", createdAt: new Date("2026-06-10T10:00:00Z"), amountCents: 10000, currency: "eur", customerId: "cus_1" },
    ];
    const refunds: StripeRefundRecord[] = [{ id: "re_1", createdAt: new Date("2026-07-05T10:00:00Z"), amountCents: 10000, currency: "eur" }];
    const months = aggregateStripeMonths(charges, refunds, [], "UTC");
    const june = months.find((m) => m.month === 6)!;
    const july = months.find((m) => m.month === 7)!;
    expect(june.cashCollectedCents).toBe(10000); // untouched
    expect(july.cashCollectedCents).toBe(-10000); // decremented, not June
  });

  it("counts a customer as a new follower only in their creation month, and only if they have ≥1 succeeded charge anywhere", () => {
    const charges: StripeChargeRecord[] = [
      { id: "ch_1", createdAt: new Date("2026-07-15T10:00:00Z"), amountCents: 5000, currency: "eur", customerId: "cus_paying" },
    ];
    const customers: StripeCustomerRecord[] = [
      { id: "cus_paying", createdAt: new Date("2026-06-20T10:00:00Z") }, // created June, paid in July → counted in June
      { id: "cus_never_paid", createdAt: new Date("2026-06-21T10:00:00Z") }, // no charge at all → not a client
    ];
    const months = aggregateStripeMonths(charges, [], customers, "UTC");
    const june = months.find((m) => m.month === 6)!;
    expect(june.newCustomers).toBe(1);
  });

  it("flags (never converts) a month containing a minority foreign currency", () => {
    const charges: StripeChargeRecord[] = [
      { id: "ch_1", createdAt: new Date("2026-06-10T10:00:00Z"), amountCents: 10000, currency: "eur", customerId: "cus_1" },
      { id: "ch_2", createdAt: new Date("2026-06-11T10:00:00Z"), amountCents: 10000, currency: "eur", customerId: "cus_2" },
      { id: "ch_3", createdAt: new Date("2026-06-12T10:00:00Z"), amountCents: 9000, currency: "usd", customerId: "cus_3" },
    ];
    const months = aggregateStripeMonths(charges, [], [], "UTC");
    const june = months.find((m) => m.month === 6)!;
    expect(june.multiCurrency).toBe(true);
    expect(june.cashCollectedCents).toBe(20000); // the usd charge is excluded, not converted
  });

  it("returns an empty array when there is no activity at all", () => {
    expect(aggregateStripeMonths([], [], [], "UTC")).toEqual([]);
  });
});
