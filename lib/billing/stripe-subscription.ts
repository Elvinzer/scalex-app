import { eq, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { businesses, subscriptionPlans, subscriptions } from "@/db/schema";

// Legacy userId values are stable legacy business IDs, never the viewer's
// selected business or an invitation-derived identity.
export const subscriptionMetadataSchema = z.object({
  businessId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  planId: z.string().uuid(),
  stripePriceId: z.string().min(1).optional(),
  priceMonthlyCents: z.string().regex(/^\d+$/)
    .refine((value) => Number.isSafeInteger(Number(value))).optional(),
  referralAttributionId: z.string().uuid().optional(),
}).refine((value) => Boolean(value.businessId || value.userId));

const invoiceSchema = z.object({
  id: z.string().min(1), status: z.string().nullable().optional(), paid: z.boolean().optional(),
  amount_remaining: z.number().int().nonnegative().optional(),
  attempt_count: z.number().int().nonnegative().optional(),
});
const stripePriceSchema = z.object({
  id: z.string().min(1), unit_amount: z.number().int().nonnegative().nullable().optional(),
  recurring: z.object({ interval: z.string().min(1) }).nullable().optional(),
}).passthrough();
const stripeSubscriptionSchema = z.object({
  id: z.string().min(1),
  customer: z.union([z.string().min(1), z.object({ id: z.string().min(1) }).passthrough()]),
  status: z.enum(["active", "trialing", "past_due", "unpaid", "canceled", "incomplete", "incomplete_expired", "paused"]),
  cancel_at_period_end: z.boolean(),
  current_period_end: z.number().int().positive().nullable().optional(),
  metadata: z.record(z.string(), z.string()),
  latest_invoice: z.union([z.string().min(1), invoiceSchema]).nullable().optional(),
  items: z.object({ data: z.array(z.object({
    current_period_end: z.number().int().positive().nullable().optional(),
    price: z.union([stripePriceSchema, z.string().min(1)]),
  }).passthrough()).min(1) }).passthrough(),
}).passthrough();

export type ParsedStripeSubscription = {
  userId: string; metadataPlanId: string; stripeSubscriptionId: string; stripeCustomerId: string;
  stripePriceId: string | null; priceMonthlyCents: number | null; status: string;
  currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; latestInvoiceId: string | null;
  invoicePaymentState: "paid" | "failed" | "unknown";
};
export type SubscriptionProjectionErrorCode = "invalid" | "mismatch" | "conflict" | "plan_missing" | "business_missing";
export type SubscriptionProjectionSyncResult =
  | { ok: true; projection: ParsedStripeSubscription; planId: string; applied: boolean; becameActive: boolean }
  | { ok: false; code: SubscriptionProjectionErrorCode; error: string };

export function parseStripeSubscription(value: unknown): ParsedStripeSubscription | null {
  const parsed = stripeSubscriptionSchema.safeParse(value);
  if (!parsed.success) return null;
  const metadata = subscriptionMetadataSchema.safeParse(parsed.data.metadata);
  if (!metadata.success) return null;
  const businessId = metadata.data.businessId ?? metadata.data.userId;
  if (!businessId) return null;
  const item = parsed.data.items.data.find((entry) =>
    typeof entry.price === "string" || (entry.price.recurring !== null && entry.price.recurring !== undefined));
  if (!item) return null;
  const price = item.price;
  const period = parsed.data.current_period_end ?? item.current_period_end;
  const invoice = parsed.data.latest_invoice;
  const invoicePaymentState = typeof invoice === "object" && invoice !== null
    ? invoice.paid === true || invoice.status === "paid" || invoice.status === "void"
      ? "paid"
      : (invoice.status === "open" || invoice.status === "uncollectible") && (invoice.amount_remaining ?? 0) > 0
        && (["past_due", "unpaid"].includes(parsed.data.status) || invoice.status === "uncollectible")
        ? "failed" : "unknown"
    : "unknown";
  return {
    userId: businessId, metadataPlanId: metadata.data.planId,
    stripeSubscriptionId: parsed.data.id,
    stripeCustomerId: typeof parsed.data.customer === "string" ? parsed.data.customer : parsed.data.customer.id,
    stripePriceId: typeof price === "string" ? price : price.id,
    priceMonthlyCents: typeof price === "string"
      ? metadata.data.priceMonthlyCents ? Number(metadata.data.priceMonthlyCents) : null
      : price.recurring?.interval === "month" && typeof price.unit_amount === "number" ? price.unit_amount : null,
    status: parsed.data.status,
    currentPeriodEnd: typeof period === "number" ? new Date(period * 1000) : null,
    cancelAtPeriodEnd: parsed.data.cancel_at_period_end,
    latestInvoiceId: typeof invoice === "string" ? invoice : invoice?.id ?? null, invoicePaymentState,
  };
}

export async function syncStripeSubscriptionProjection(
  value: unknown, expectedBusinessId?: string,
  options: { failedInvoiceId?: string; refresh?: () => Promise<unknown> } = {},
): Promise<SubscriptionProjectionSyncResult> {
  const initial = parseStripeSubscription(value);
  if (!initial) return { ok: false, code: "invalid", error: "Invalid subscription payload." };
  if (expectedBusinessId && initial.userId !== expectedBusinessId) {
    return { ok: false, code: "mismatch", error: "Subscription business mismatch." };
  }
  return db.transaction(async (tx): Promise<SubscriptionProjectionSyncResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing:${initial.userId}`}, 0))`);
    // Re-read Stripe while holding the same business lock used by checkout.
    // Concurrent or delayed events cannot overwrite a newer canonical state.
    const projection = options.refresh ? parseStripeSubscription(await options.refresh()) : initial;
    if (!projection) return { ok: false, code: "invalid", error: "Invalid authoritative subscription payload." };
    if (projection.userId !== initial.userId || projection.stripeSubscriptionId !== initial.stripeSubscriptionId) {
      return { ok: false, code: "conflict", error: "Authoritative subscription mapping changed." };
    }
    const [business] = await tx.select({ id: businesses.id, stripeCustomerId: businesses.stripeCustomerId, status: businesses.status })
      .from(businesses).where(eq(businesses.id, projection.userId)).limit(1);
    if (!business) return { ok: false, code: "business_missing", error: "Subscription business was not found." };
    if (business.stripeCustomerId && business.stripeCustomerId !== projection.stripeCustomerId) {
      return { ok: false, code: "conflict", error: "Stripe customer belongs to another business." };
    }
    const existing = await tx.select().from(subscriptions).where(or(
      eq(subscriptions.stripeSubscriptionId, projection.stripeSubscriptionId), eq(subscriptions.userId, projection.userId),
    )).limit(2);
    const bySubscription = existing.find((row) => row.stripeSubscriptionId === projection.stripeSubscriptionId);
    if (bySubscription && bySubscription.userId !== projection.userId) {
      return { ok: false, code: "conflict", error: "Subscription is already linked to another business." };
    }
    const current = existing.find((row) => row.userId === projection.userId);
    if (current?.stripeSubscriptionId && current.stripeSubscriptionId !== projection.stripeSubscriptionId
      && !["canceled", "incomplete_expired"].includes(current.status)) {
      if (["canceled", "incomplete_expired"].includes(projection.status)) {
        return { ok: true, projection, planId: current.planId, applied: false, becameActive: false };
      }
      return { ok: false, code: "conflict", error: "Business already has another subscription." };
    }
    const [planByPrice] = projection.stripePriceId
      ? await tx.select({ id: subscriptionPlans.id }).from(subscriptionPlans)
        .where(eq(subscriptionPlans.stripePriceId, projection.stripePriceId)).limit(1) : [];
    if (planByPrice && planByPrice.id !== projection.metadataPlanId) {
      return { ok: false, code: "conflict", error: "Subscription price does not match its plan." };
    }
    const planId = planByPrice?.id ?? projection.metadataPlanId;
    const [plan] = await tx.select({ id: subscriptionPlans.id }).from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, planId)).limit(1);
    if (!plan) return { ok: false, code: "plan_missing", error: "Subscription plan was not found." };
    const invoiceFailed = projection.invoicePaymentState === "failed"
      || (options.failedInvoiceId !== undefined && options.failedInvoiceId === projection.latestInvoiceId
        && projection.invoicePaymentState !== "paid");
    const paymentBlockedAt = invoiceFailed ? current?.paymentBlockedAt ?? new Date()
      : projection.invoicePaymentState === "paid" ? null : current?.paymentBlockedAt ?? null;
    const values = {
      userId: projection.userId, planId, stripeCustomerId: projection.stripeCustomerId,
      stripeSubscriptionId: projection.stripeSubscriptionId, stripePriceId: projection.stripePriceId,
      priceMonthlyCents: projection.priceMonthlyCents, status: projection.status,
      currentPeriodEnd: projection.currentPeriodEnd, cancelAtPeriodEnd: projection.cancelAtPeriodEnd,
      latestInvoiceId: projection.latestInvoiceId ?? current?.latestInvoiceId ?? null, paymentBlockedAt,
    };
    await tx.insert(subscriptions).values(values).onConflictDoUpdate({
      target: subscriptions.userId, set: { ...values, updatedAt: new Date() },
    });
    const active = business.status !== "archived" && ["active", "trialing"].includes(projection.status) && !paymentBlockedAt
      && (!projection.currentPeriodEnd || projection.currentPeriodEnd > new Date());
    await tx.update(businesses).set({
      stripeCustomerId: projection.stripeCustomerId, ...(active ? { status: "active" } : {}),
      checkoutSessionId: null, checkoutSessionUrl: null, checkoutSessionExpiresAt: null,
    }).where(eq(businesses.id, projection.userId));
    const wasActive = current && ["active", "trialing"].includes(current.status) && !current.paymentBlockedAt
      && (!current.currentPeriodEnd || current.currentPeriodEnd > new Date());
    return { ok: true, projection, planId, applied: true, becameActive: active && !wasActive };
  });
}
