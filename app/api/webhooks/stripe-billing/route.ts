import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { processedStripeEvents } from "@/db/schema";
import { billingInvoiceSchema, getInvoiceSubscriptionId } from "@/lib/billing/stripe-invoice";
import { sendTrialReminderEmail } from "@/lib/billing/trial-reminder";
import { subscriptionMetadataSchema, syncStripeSubscriptionProjection } from "@/lib/billing/stripe-subscription";
import { resumeBusinessOperations } from "@/lib/inngest/business-recovery";
import { billingTrialReminderRequested, inngest } from "@/lib/inngest/client";
import { isRateLimited } from "@/lib/rate-limit";
import { recordPaidReferralInvoice, reverseAvailableReferralCommission } from "@/lib/referrals/commissions";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
import { requireEnv } from "@/lib/utils";

const referenceSchema = z.union([z.string().min(1), z.object({ id: z.string().min(1) })]);
const eventSchema = z.object({
  id: z.string().min(1), type: z.string().min(1),
  data: z.object({ object: z.unknown() }),
});
const subscriptionReferenceSchema = z.object({ id: z.string().min(1) });

async function syncCurrentSubscription(subscriptionId: string, failedInvoiceId?: string) {
  const stripe = getPlatformStripeClient();
  const retrieve = () => stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price", "latest_invoice"] });
  const subscription = await retrieve();
  const result = await syncStripeSubscriptionProjection(subscription, undefined, { failedInvoiceId, refresh: retrieve });
  if (!result.ok) {
    const metadata = z.object({ metadata: z.record(z.string(), z.string()) }).safeParse(subscription);
    const hasBusinessHint = metadata.success && ("businessId" in metadata.data.metadata || "userId" in metadata.data.metadata);
    if (result.code === "invalid" && !hasBusinessHint) {
      return null; // An unrelated platform subscription is an intentional ignore.
    }
    console.error("[billing] subscription projection rejected", { code: result.code, subscriptionId });
    throw new Error("subscription_projection_rejected");
  }
  return result;
}

async function scheduleTrialReminder(value: unknown) {
  const parsed = z.object({
    id: z.string().min(1), metadata: z.record(z.string(), z.string()),
    trial_end: z.number().int().positive().nullable().optional(),
  }).safeParse(value);
  if (!parsed.success || !parsed.data.trial_end) return;
  const metadata = subscriptionMetadataSchema.safeParse(parsed.data.metadata);
  if (!metadata.success) return;
  const businessId = metadata.data.businessId ?? metadata.data.userId;
  if (!businessId) return;
  const payload = { userId: businessId, subscriptionId: parsed.data.id, trialEnd: parsed.data.trial_end };
  const reminderAt = (payload.trialEnd - 2 * 24 * 60 * 60) * 1000;
  if (reminderAt <= Date.now() || (!process.env.INNGEST_EVENT_KEY && !process.env.INNGEST_DEV)) {
    await sendTrialReminderEmail(payload);
  } else {
    await inngest.send({ ...billingTrialReminderRequested.create(payload), id: `trial-reminder:${payload.subscriptionId}:${payload.trialEnd}` });
  }
}

function epochDate(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 2_000_000) {
    return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  }
  const address = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? "unknown";
  if (isRateLimited(`billing-webhook:${address}`, 600)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing_signature" }, { status: 400 });
  const body = await request.text();
  if (body.length > 2_000_000) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const stripe = getPlatformStripeClient();
  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(stripe.webhooks.constructEvent(body, signature, requireEnv("STRIPE_WEBHOOK_SECRET")));
  } catch {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }
  const [processed] = await db.select({ id: processedStripeEvents.id }).from(processedStripeEvents)
    .where(eq(processedStripeEvents.id, event.id)).limit(1);
  if (processed) return NextResponse.json({ received: true });

  try {
    let recoveryBusinessId: string | null = null;
    if (event.type === "checkout.session.completed") {
      const session = z.object({ subscription: referenceSchema.nullable().optional() }).parse(event.data.object);
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
      if (subscriptionId) {
        const result = await syncCurrentSubscription(subscriptionId);
        if (result?.applied && ["active", "trialing"].includes(result.projection.status)) recoveryBusinessId = result.projection.userId;
      }
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(event.type)) {
      const reference = subscriptionReferenceSchema.parse(event.data.object);
      const result = await syncCurrentSubscription(reference.id);
      if (result?.applied && ["active", "trialing"].includes(result.projection.status)) recoveryBusinessId = result.projection.userId;
    } else if (event.type === "customer.subscription.trial_will_end") {
      await scheduleTrialReminder(event.data.object);
    } else if (["invoice.payment_failed", "invoice.payment_action_required", "invoice.paid", "invoice.voided"].includes(event.type)) {
      const invoice = billingInvoiceSchema.parse(event.data.object);
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (subscriptionId) {
        const failed = event.type === "invoice.payment_failed" || event.type === "invoice.payment_action_required";
        const result = await syncCurrentSubscription(subscriptionId, failed ? invoice.id : undefined);
        if (result?.applied && ["active", "trialing"].includes(result.projection.status)) recoveryBusinessId = result.projection.userId;
        if (event.type === "invoice.paid" && result && invoice.currency && invoice.amount_paid !== undefined) {
          await recordPaidReferralInvoice({
            invoiceId: invoice.id, stripeSubscriptionId: subscriptionId, referredAccountId: result.projection.userId,
            currency: invoice.currency, grossAmountCents: invoice.amount_paid,
            eligibleAmountCents: invoice.total_excluding_tax == null ? 0 : Math.min(invoice.total_excluding_tax, invoice.amount_paid),
            periodStart: epochDate(invoice.period_start), periodEnd: epochDate(invoice.period_end),
          });
        }
      }
      if (event.type === "invoice.voided") await reverseAvailableReferralCommission(invoice.id);
    }
    // Recovery enqueueing must succeed before acknowledging the payment event.
    if (recoveryBusinessId) await resumeBusinessOperations(recoveryBusinessId);
    await db.insert(processedStripeEvents).values({ id: event.id, type: event.type })
      .onConflictDoNothing({ target: processedStripeEvents.id });
    return NextResponse.json({ received: true });
  } catch {
    console.error("[billing] event processing failed", { eventId: event.id, type: event.type });
    return NextResponse.json({ error: "webhook_processing_failed" }, { status: 500 });
  }
}
