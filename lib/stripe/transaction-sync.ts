import type Stripe from "stripe";
import { z } from "zod";

import { db } from "@/db";
import { stripeTransactionRefunds, stripeTransactions } from "@/db/schema";

import type {
  StripeInsightRefund,
  StripeInsightTransaction,
  StripePaymentType,
  StripeTransactionStatus,
} from "./transaction-insights";
import type { ReadOnlyStripeClient } from "./read-only-client";

const resourceSchema = z.union([z.string().min(1), z.object({ id: z.string().min(1) })]).nullable().optional();

const chargeSchema = z
  .object({
    id: z.string().min(1),
    amount: z.number().int().nonnegative(),
    amount_refunded: z.number().int().nonnegative(),
    currency: z.string().min(1),
    created: z.number().int().nonnegative(),
    status: z.enum(["succeeded", "pending", "failed"]),
    refunded: z.boolean().optional(),
    customer: resourceSchema,
    invoice: resourceSchema,
    payment_intent: resourceSchema,
    failure_code: z.string().nullable().optional(),
  })
  .passthrough();

const refundSchema = z
  .object({
    id: z.string().min(1),
    amount: z.number().int().nonnegative(),
    currency: z.string().min(1),
    created: z.number().int().nonnegative(),
    status: z.enum(["succeeded", "pending", "failed", "canceled"]),
    charge: resourceSchema,
    payment_intent: resourceSchema,
  })
  .passthrough();

const customerSchema = z
  .object({
    name: z.string().nullable().optional(),
  })
  .passthrough();

const invoiceClassificationSchema = z
  .object({
    billing_reason: z.string().nullable().optional(),
    parent: z.object({ type: z.string().optional() }).nullable().optional(),
    subscription: resourceSchema,
  })
  .passthrough();

export class StripeProjectionError extends Error {
  constructor() {
    super("Stripe transaction data could not be validated");
    this.name = "StripeProjectionError";
  }
}

export type StripeNormalizedCharge = Omit<StripeInsightTransaction, "occurredAt"> & {
  stripeChargeId: string;
  paymentIntentId: string | null;
  customerId: string | null;
  invoiceId: string | null;
  subscriptionId: string | null;
  failureCode: string | null;
  occurredAt: Date;
};

export type StripeNormalizedRefund = Omit<StripeInsightRefund, "occurredAt"> & {
  stripeRefundId: string;
  paymentIntentId: string | null;
  occurredAt: Date;
};

export function normalizeStripeCharge(
  input: unknown,
  options: { stripeAccountId: string; paymentType?: StripePaymentType; customerName?: string | null },
): StripeNormalizedCharge | null {
  const parsed = chargeSchema.safeParse(input);
  if (!parsed.success) return null;
  const charge = parsed.data;
  const status: StripeTransactionStatus = charge.status === "failed"
    ? "failed"
    : charge.amount_refunded >= charge.amount || charge.refunded
      ? "refunded"
      : charge.amount_refunded > 0
        ? "partially_refunded"
        : charge.status;

  return {
    id: charge.id,
    stripeChargeId: charge.id,
    stripeAccountId: options.stripeAccountId,
    amountCents: charge.amount,
    amountRefundedCents: Math.min(charge.amount, charge.amount_refunded),
    currency: charge.currency.trim().toLowerCase(),
    status,
    paymentType: options.paymentType ?? "unknown",
    customerId: resourceId(charge.customer),
    customerName: options.customerName ?? null,
    occurredAt: new Date(charge.created * 1000),
    paymentIntentId: resourceId(charge.payment_intent),
    invoiceId: resourceId(charge.invoice),
    subscriptionId: null,
    failureCode: charge.failure_code ?? null,
  };
}

export function normalizeStripeRefund(
  input: unknown,
  options: { stripeAccountId: string },
): StripeNormalizedRefund | null {
  const parsed = refundSchema.safeParse(input);
  if (!parsed.success) return null;
  const refund = parsed.data;
  return {
    id: refund.id,
    stripeRefundId: refund.id,
    stripeAccountId: options.stripeAccountId,
    stripeChargeId: resourceId(refund.charge),
    paymentIntentId: resourceId(refund.payment_intent),
    amountCents: refund.amount,
    currency: refund.currency.trim().toLowerCase(),
    status: refund.status,
    occurredAt: new Date(refund.created * 1000),
  };
}

function resourceId(resource: unknown): string | null {
  const parsed = resourceSchema.safeParse(resource);
  if (!parsed.success || !parsed.data) return null;
  return typeof parsed.data === "string" ? parsed.data : parsed.data.id;
}

function lookbackUnixSeconds(monthsBack: number): number {
  return Math.floor(Date.now() / 1000) - monthsBack * 31 * 24 * 60 * 60;
}

async function classifyCharge(
  charge: Stripe.Charge,
  stripe: ReadOnlyStripeClient,
  subscriptionCustomerCache: Map<string, string | null>,
): Promise<{ paymentType: StripePaymentType; subscriptionId: string | null }> {
  const parsed = chargeSchema.safeParse(charge);
  if (!parsed.success) return { paymentType: "unknown", subscriptionId: null };
  const invoiceId = resourceId(parsed.data.invoice);
  let hasSubscriptionEvidence = false;
  let subscriptionId: string | null = null;

  if (invoiceId) {
    try {
      const invoice = await stripe.invoices.retrieve(invoiceId);
      const parsedInvoice = invoiceClassificationSchema.safeParse(invoice);
      if (parsedInvoice.success) {
        hasSubscriptionEvidence = Boolean(
          parsedInvoice.data.billing_reason?.startsWith("subscription") ||
            parsedInvoice.data.parent?.type === "subscription_details" ||
            parsedInvoice.data.subscription,
        );
        subscriptionId = resourceId(parsedInvoice.data.subscription);
      }
    } catch {
      // Classification is best effort. A charge remains usable when the
      // optional invoice endpoint is temporarily unavailable.
    }
  }

  const customerId = resourceId(parsed.data.customer);
  if (customerId) {
    const cached = subscriptionCustomerCache.get(customerId);
    if (cached !== undefined) {
      if (cached) hasSubscriptionEvidence = true;
      subscriptionId = subscriptionId ?? cached;
    } else {
      let customerSubscriptionId: string | null = null;
      try {
        for await (const subscription of stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 })) {
          if (subscription.created > parsed.data.created) continue;
          if (subscription.ended_at !== null && subscription.ended_at < parsed.data.created) continue;
          customerSubscriptionId = subscription.id;
          break;
        }
      } catch {
        // Same best-effort rule as invoice classification: do not abort a
        // complete account projection because subscriptions are unavailable.
      }
      subscriptionCustomerCache.set(customerId, customerSubscriptionId);
      if (customerSubscriptionId) {
        hasSubscriptionEvidence = true;
        subscriptionId = subscriptionId ?? customerSubscriptionId;
      }
    }
  }

  if (hasSubscriptionEvidence) return { paymentType: "subscription", subscriptionId };
  if (invoiceId || customerId) return { paymentType: "one_shot", subscriptionId: null };
  return { paymentType: "unknown", subscriptionId: null };
}

export type StripeTransactionSyncResult = {
  transactionsUpserted: number;
  refundsUpserted: number;
  invalidCharges: number;
  invalidRefunds: number;
};

/**
 * Rebuilds the account's recent transaction projection from Stripe. Every
 * write is scoped to both the app account and the Connect account id, and the
 * conflict keys make replaying a job safe.
 */
export async function syncStripeTransactions(
  userId: string,
  stripeAccountId: string,
  stripe: ReadOnlyStripeClient,
  monthsBack = 12,
): Promise<StripeTransactionSyncResult> {
  const since = lookbackUnixSeconds(monthsBack);
  const charges: Stripe.Charge[] = [];
  for await (const charge of stripe.charges.list({ created: { gte: since }, limit: 100 })) {
    charges.push(charge);
  }

  const refunds: Stripe.Refund[] = [];
  for await (const refund of stripe.refunds.list({ created: { gte: since }, limit: 100 })) {
    refunds.push(refund);
  }

  const syncedAt = new Date();
  const subscriptionCustomerCache = new Map<string, string | null>();
  const customerNameCache = new Map<string, string | null>();
  let transactionsUpserted = 0;
  let invalidCharges = 0;
  for (const charge of charges) {
    const classification = await classifyCharge(charge, stripe, subscriptionCustomerCache);
    const parsedCharge = chargeSchema.safeParse(charge);
    const customerId = parsedCharge.success ? resourceId(parsedCharge.data.customer) : null;
    let customerName: string | null = null;
    if (customerId) {
      const cachedName = customerNameCache.get(customerId);
      if (cachedName !== undefined) {
        customerName = cachedName;
      } else {
        try {
          const customer = await stripe.customers.retrieve(customerId);
          const parsedCustomer = customerSchema.safeParse(customer);
          customerName = parsedCustomer.success ? parsedCustomer.data.name?.trim() || null : null;
        } catch {
          customerName = null;
        }
        customerNameCache.set(customerId, customerName);
      }
    }
    const normalized = normalizeStripeCharge(charge, { stripeAccountId, paymentType: classification.paymentType, customerName });
    if (!normalized) {
      invalidCharges += 1;
      continue;
    }
    await db
      .insert(stripeTransactions)
      .values({
        userId,
        stripeAccountId,
        stripeChargeId: normalized.stripeChargeId,
        paymentIntentId: normalized.paymentIntentId,
        customerId: normalized.customerId,
        customerName: normalized.customerName,
        invoiceId: normalized.invoiceId,
        subscriptionId: classification.subscriptionId,
        amountCents: normalized.amountCents,
        amountRefundedCents: normalized.amountRefundedCents,
        currency: normalized.currency,
        status: normalized.status,
        paymentType: normalized.paymentType,
        failureCode: normalized.failureCode,
        failureMessage: null,
        occurredAt: normalized.occurredAt,
        lastSyncedAt: syncedAt,
      })
      .onConflictDoUpdate({
        target: [stripeTransactions.userId, stripeTransactions.stripeAccountId, stripeTransactions.stripeChargeId],
        set: {
          paymentIntentId: normalized.paymentIntentId,
          customerId: normalized.customerId,
          customerName: normalized.customerName,
          invoiceId: normalized.invoiceId,
          subscriptionId: classification.subscriptionId,
          amountCents: normalized.amountCents,
          amountRefundedCents: normalized.amountRefundedCents,
          currency: normalized.currency,
          status: normalized.status,
          paymentType: normalized.paymentType,
          failureCode: normalized.failureCode,
          failureMessage: null,
          occurredAt: normalized.occurredAt,
          lastSyncedAt: syncedAt,
        },
      });
    transactionsUpserted += 1;
  }

  let refundsUpserted = 0;
  let invalidRefunds = 0;
  for (const refund of refunds) {
    const normalized = normalizeStripeRefund(refund, { stripeAccountId });
    if (!normalized) {
      invalidRefunds += 1;
      continue;
    }
    await db
      .insert(stripeTransactionRefunds)
      .values({
        userId,
        stripeAccountId,
        stripeRefundId: normalized.stripeRefundId,
        stripeChargeId: normalized.stripeChargeId,
        paymentIntentId: normalized.paymentIntentId,
        amountCents: normalized.amountCents,
        currency: normalized.currency,
        status: normalized.status,
        occurredAt: normalized.occurredAt,
        lastSyncedAt: syncedAt,
      })
      .onConflictDoUpdate({
        target: [
          stripeTransactionRefunds.userId,
          stripeTransactionRefunds.stripeAccountId,
          stripeTransactionRefunds.stripeRefundId,
        ],
        set: {
          stripeChargeId: normalized.stripeChargeId,
          paymentIntentId: normalized.paymentIntentId,
          amountCents: normalized.amountCents,
          currency: normalized.currency,
          status: normalized.status,
          occurredAt: normalized.occurredAt,
          lastSyncedAt: syncedAt,
        },
      });
    refundsUpserted += 1;
  }

  return { transactionsUpserted, refundsUpserted, invalidCharges, invalidRefunds };
}
