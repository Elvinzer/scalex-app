import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

import { db } from "@/db";
import { processedStripeEvents } from "@/db/schema";
import { sendTrialReminderEmail } from "@/lib/billing/trial-reminder";
import { subscriptionMetadataSchema, syncStripeSubscriptionProjection } from "@/lib/billing/stripe-subscription";
import { billingTrialReminderRequested, inngest } from "@/lib/inngest/client";
import { recordPaidReferralInvoice, reverseAvailableReferralCommission } from "@/lib/referrals/commissions";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
import { requireEnv } from "@/lib/utils";

// First Stripe webhook in this codebase (Stripe Connect uses an OAuth
// redirect, not a webhook — see app/api/stripe/callback/route.ts). Per
// CLAUDE.md's non-negotiable rule: verify the signature before acting, and
// stay idempotent by checking event.id against processedStripeEvents first.

// Set on the Subscription itself via checkout.sessions.create's
// subscription_data.metadata (app/api/billing/checkout/route.ts) so every
// subscription event — not just checkout.session.completed — carries a
// stable, non-guessable link back to our own account/plan rows, regardless
// of delivery order.
const invoicePayloadSchema = z.object({
  id: z.string().min(1),
  subscription: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]).nullable().optional(),
  currency: z.string().regex(/^[a-zA-Z]{3}$/),
  amount_paid: z.number().int().nonnegative(),
  total_excluding_tax: z.number().int().nonnegative().nullable(),
  period_start: z.number().int().nullable().optional(),
  period_end: z.number().int().nullable().optional(),
});

function subscriptionIdFromInvoice(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function stripeEpochToDate(value: number | null | undefined): Date | null {
  return typeof value === "number" ? new Date(value * 1000) : null;
}

async function recordInvoiceCommission(stripe: Stripe, object: unknown): Promise<void> {
  const parsedInvoice = invoicePayloadSchema.safeParse(object);
  if (!parsedInvoice.success) return;

  const subscriptionId = subscriptionIdFromInvoice(parsedInvoice.data.subscription);
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const parsedMetadata = subscriptionMetadataSchema.safeParse(subscription.metadata);
  if (!parsedMetadata.success) return;

  await recordPaidReferralInvoice({
    invoiceId: parsedInvoice.data.id,
    stripeSubscriptionId: subscription.id,
    referredAccountId: parsedMetadata.data.userId,
    currency: parsedInvoice.data.currency,
    grossAmountCents: parsedInvoice.data.amount_paid,
    eligibleAmountCents:
      parsedInvoice.data.total_excluding_tax === null
        ? 0
        : Math.min(parsedInvoice.data.total_excluding_tax, parsedInvoice.data.amount_paid),
    periodStart: stripeEpochToDate(parsedInvoice.data.period_start),
    periodEnd: stripeEpochToDate(parsedInvoice.data.period_end),
  });
}

async function reverseInvoiceCommission(object: unknown): Promise<void> {
  const parsedInvoice = invoicePayloadSchema.pick({ id: true }).safeParse(object);
  if (parsedInvoice.success) await reverseAvailableReferralCommission(parsedInvoice.data.id);
}

async function markProcessed(eventId: string, type: string): Promise<boolean> {
  const [inserted] = await db
    .insert(processedStripeEvents)
    .values({ id: eventId, type })
    .onConflictDoNothing({ target: processedStripeEvents.id })
    .returning({ id: processedStripeEvents.id });
  return Boolean(inserted);
}

async function hasBeenProcessed(eventId: string): Promise<boolean> {
  const [processed] = await db
    .select({ id: processedStripeEvents.id })
    .from(processedStripeEvents)
    .where(eq(processedStripeEvents.id, eventId))
    .limit(1);
  return Boolean(processed);
}

async function upsertFromSubscription(subscription: unknown): Promise<void> {
  const result = await syncStripeSubscriptionProjection(subscription);
  if (!result.ok && result.code === "invalid") {
    // Not a subscription created by our own checkout — ignore unrelated
    // subscriptions without logging their payload or metadata.
    return;
  }
  if (!result.ok) return;
}

async function scheduleTrialReminder(subscription: unknown): Promise<void> {
  const parsedSubscription = z
    .object({
      id: z.string().min(1),
      metadata: z.record(z.string(), z.string()),
      trial_end: z.number().int().positive().nullable().optional(),
    })
    .safeParse(subscription);
  if (!parsedSubscription.success || !parsedSubscription.data.trial_end) return;

  const parsedMetadata = subscriptionMetadataSchema.safeParse(parsedSubscription.data.metadata);
  if (!parsedMetadata.success) return;

  const payload = {
    userId: parsedMetadata.data.userId,
    subscriptionId: parsedSubscription.data.id,
    trialEnd: parsedSubscription.data.trial_end,
  };
  const reminderAt = (payload.trialEnd - 2 * 24 * 60 * 60) * 1000;

  if (reminderAt <= Date.now() || (!process.env.INNGEST_EVENT_KEY && !process.env.INNGEST_DEV)) {
    await sendTrialReminderEmail(payload);
    return;
  }

  await inngest.send(billingTrialReminderRequested.create(payload));
}

export async function POST(request: NextRequest) {
  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (contentLength !== null && Number.isFinite(contentLength) && contentLength > 2_000_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  const signature = request.headers.get("stripe-signature");
  const body = await request.text();
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const stripe = getPlatformStripeClient();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, requireEnv("STRIPE_WEBHOOK_SECRET"));
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (await hasBeenProcessed(event.id)) {
    return NextResponse.json({ received: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = z
          .object({ subscription: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]).nullable().optional() })
          .safeParse(event.data.object);
        const subscriptionId =
          session.success && session.data.subscription
            ? typeof session.data.subscription === "string"
              ? session.data.subscription
              : session.data.subscription.id
            : null;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
          await upsertFromSubscription(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await upsertFromSubscription(event.data.object);
        break;
      }
      case "customer.subscription.trial_will_end": {
        await scheduleTrialReminder(event.data.object);
        break;
      }
      case "invoice.paid": {
        await recordInvoiceCommission(stripe, event.data.object);
        break;
      }
      case "invoice.voided": {
        await reverseInvoiceCommission(event.data.object);
        break;
      }
      default:
        break;
    }

    await markProcessed(event.id, event.type);
  } catch {
    // Do not write the idempotency ledger on failure. Stripe will retry the
    // event and the business operations are themselves upsert/idempotent.
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
