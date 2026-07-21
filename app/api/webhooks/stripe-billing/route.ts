import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";
import { z } from "zod";

import { db } from "@/db";
import { processedStripeEvents, subscriptions } from "@/db/schema";
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
const subscriptionMetadataSchema = z.object({
  userId: z.string().uuid(),
  planId: z.string().uuid(),
});

async function markProcessed(eventId: string, type: string): Promise<boolean> {
  const [inserted] = await db
    .insert(processedStripeEvents)
    .values({ id: eventId, type })
    .onConflictDoNothing({ target: processedStripeEvents.id })
    .returning({ id: processedStripeEvents.id });
  return Boolean(inserted);
}

async function upsertFromSubscription(subscription: Stripe.Subscription): Promise<void> {
  const parsed = subscriptionMetadataSchema.safeParse(subscription.metadata);
  if (!parsed.success) {
    // Not a subscription our own checkout created (e.g. one created by hand
    // in the Stripe Dashboard while testing) — nothing to reconcile.
    return;
  }

  const currentPeriodEndSeconds = subscription.items.data[0]?.current_period_end;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  const values = {
    userId: parsed.data.userId,
    planId: parsed.data.planId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: currentPeriodEndSeconds ? new Date(currentPeriodEndSeconds * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  };

  await db
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({
      target: subscriptions.userId,
      set: { ...values, updatedAt: new Date() },
    });
}

export async function POST(request: NextRequest) {
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

  const isNewEvent = await markProcessed(event.id, event.type);
  if (!isNewEvent) {
    return NextResponse.json({ received: true });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (typeof session.subscription === "string") {
        const subscription = await stripe.subscriptions.retrieve(session.subscription);
        await upsertFromSubscription(subscription);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      await upsertFromSubscription(event.data.object as Stripe.Subscription);
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
