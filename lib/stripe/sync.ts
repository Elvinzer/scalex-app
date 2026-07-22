import type { ReadOnlyStripeClient } from "./read-only-client";
import { DEFAULT_STRIPE_TIMEZONE, yearMonthInTimezone } from "./timezone";

export type StripeChargeRecord = { id: string; createdAt: Date; amountCents: number; currency: string; customerId: string | null };
export type StripeRefundRecord = { id: string; createdAt: Date; amountCents: number; currency: string };
export type StripeCustomerRecord = { id: string; createdAt: Date };

export type StripeMonthAggregate = {
  year: number;
  month: number;
  cashCollectedCents: number;
  // Paying customers this month — distinct from monthly_metrics.newFollowers
  // (top-of-funnel leads/subscribers), never conflated.
  newCustomers: number;
  // A charge/refund in a currency other than the dominant one was seen and
  // EXCLUDED from cashCollectedCents (never converted — no FX rate service
  // in this phase) — surfaced for a future tooltip, not itself a UI concern
  // of this pass.
  multiCurrency: boolean;
};

// Generous, over-fetches a little at the edges (not timezone-precise) —
// only used to bound the Stripe API query window; the actual per-month
// bucketing (which DOES need to be precise) happens in aggregateStripeMonths
// via yearMonthInTimezone.
function lookbackUnixSeconds(monthsBack: number): number {
  return Math.floor(Date.now() / 1000) - monthsBack * 31 * 24 * 60 * 60;
}

export async function fetchStripeHistory(
  stripe: ReadOnlyStripeClient,
  monthsBack: number
): Promise<{ charges: StripeChargeRecord[]; refunds: StripeRefundRecord[]; customers: StripeCustomerRecord[] }> {
  const since = lookbackUnixSeconds(monthsBack);

  const charges: StripeChargeRecord[] = [];
  for await (const charge of stripe.charges.list({ created: { gte: since }, limit: 100 })) {
    if (charge.status !== "succeeded") continue;
    charges.push({
      id: charge.id,
      createdAt: new Date(charge.created * 1000),
      amountCents: charge.amount,
      currency: charge.currency,
      customerId: typeof charge.customer === "string" ? charge.customer : (charge.customer?.id ?? null),
    });
  }

  const refunds: StripeRefundRecord[] = [];
  for await (const refund of stripe.refunds.list({ created: { gte: since }, limit: 100 })) {
    refunds.push({ id: refund.id, createdAt: new Date(refund.created * 1000), amountCents: refund.amount, currency: refund.currency });
  }

  const customers: StripeCustomerRecord[] = [];
  for await (const customer of stripe.customers.list({ created: { gte: since }, limit: 100 })) {
    customers.push({ id: customer.id, createdAt: new Date(customer.created * 1000) });
  }

  return { charges, refunds, customers };
}

type MonthBucket = { year: number; month: number; cashCents: number; multiCurrency: boolean };

function bucketKey(year: number, month: number): string {
  return `${year}-${month}`;
}

// Pure — no I/O, no Date.now() dependence beyond what's already baked into
// the input timestamps, fully unit-testable. Deliberately recomputes the
// FULL month total from the raw records every time (never an incremental
// add) so replaying a sync can never double a figure.
export function aggregateStripeMonths(
  charges: StripeChargeRecord[],
  refunds: StripeRefundRecord[],
  customers: StripeCustomerRecord[],
  timeZone: string = DEFAULT_STRIPE_TIMEZONE
): StripeMonthAggregate[] {
  const currencyCounts = new Map<string, number>();
  for (const charge of charges) currencyCounts.set(charge.currency, (currencyCounts.get(charge.currency) ?? 0) + 1);
  let homeCurrency: string | null = null;
  let bestCount = 0;
  for (const [currency, count] of currencyCounts) {
    if (count > bestCount) {
      bestCount = count;
      homeCurrency = currency;
    }
  }

  const buckets = new Map<string, MonthBucket>();
  function getBucket(year: number, month: number): MonthBucket {
    const key = bucketKey(year, month);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { year, month, cashCents: 0, multiCurrency: false };
      buckets.set(key, bucket);
    }
    return bucket;
  }

  for (const charge of charges) {
    const { year, month } = yearMonthInTimezone(charge.createdAt, timeZone);
    const bucket = getBucket(year, month);
    if (homeCurrency !== null && charge.currency !== homeCurrency) {
      bucket.multiCurrency = true;
      continue;
    }
    bucket.cashCents += charge.amountCents;
  }

  // Refunds are attributed to the month THEY happened in, never the
  // original charge's month — a June sale refunded in July decrements July.
  for (const refund of refunds) {
    const { year, month } = yearMonthInTimezone(refund.createdAt, timeZone);
    const bucket = getBucket(year, month);
    if (homeCurrency !== null && refund.currency !== homeCurrency) {
      bucket.multiCurrency = true;
      continue;
    }
    bucket.cashCents -= refund.amountCents;
  }

  // "Nouveaux clients" = customers created that month who have at least one
  // succeeded charge ANYWHERE in the fetched window (not necessarily the
  // same month) — a customer created with no payment isn't a client.
  const customerIdsWithAnyCharge = new Set(charges.filter((c) => c.customerId).map((c) => c.customerId as string));
  const newCustomersPerMonth = new Map<string, number>();
  for (const customer of customers) {
    if (!customerIdsWithAnyCharge.has(customer.id)) continue;
    const { year, month } = yearMonthInTimezone(customer.createdAt, timeZone);
    getBucket(year, month); // ensures a bucket exists even if this month had no charges/refunds of its own
    const key = bucketKey(year, month);
    newCustomersPerMonth.set(key, (newCustomersPerMonth.get(key) ?? 0) + 1);
  }

  return [...buckets.values()].map((bucket) => ({
    year: bucket.year,
    month: bucket.month,
    cashCollectedCents: bucket.cashCents,
    newCustomers: newCustomersPerMonth.get(bucketKey(bucket.year, bucket.month)) ?? 0,
    multiCurrency: bucket.multiCurrency,
  }));
}
