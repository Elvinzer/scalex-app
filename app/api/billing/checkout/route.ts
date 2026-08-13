import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";

import { db } from "@/db";
import { referralAttributions, subscriptionPlans, users } from "@/db/schema";
import { isRateLimited } from "@/lib/rate-limit";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";

const MARKETING_PLAN_CATALOG = {
  solo: {
    name: "Solo",
    priceMonthlyCents: 7_900,
    features: {
      teamMembersEnabled: false,
      maxTeamMembers: null,
      nativeBookingEnabled: false,
      maxBookingEvents: null,
    },
  },
  team: {
    name: "Équipe",
    priceMonthlyCents: 19_900,
    features: {
      teamMembersEnabled: true,
      maxTeamMembers: null,
      nativeBookingEnabled: false,
      maxBookingEvents: null,
    },
  },
} as const;

type MarketingPlanKey = keyof typeof MARKETING_PLAN_CATALOG;

function isMarketingPlanKey(value: string): value is MarketingPlanKey {
  return Object.prototype.hasOwnProperty.call(MARKETING_PLAN_CATALOG, value);
}

async function getOrCreateMarketingPlan(planKey: string) {
  const [existing] = await db
    .select()
    .from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.key, planKey), eq(subscriptionPlans.isActive, true)))
    .limit(1);
  if (existing) return existing;

  if (!isMarketingPlanKey(planKey) || !process.env.STRIPE_CONNECT_CLIENT_SECRET) return null;
  const catalogEntry = MARKETING_PLAN_CATALOG[planKey];
  const stripe = getPlatformStripeClient();
  const product = await stripe.products.create({ name: `Minaly ${catalogEntry.name}` });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: catalogEntry.priceMonthlyCents,
    currency: "eur",
    recurring: { interval: "month" },
  });

  const [created] = await db
    .insert(subscriptionPlans)
    .values({
      key: planKey,
      name: catalogEntry.name,
      priceMonthlyCents: catalogEntry.priceMonthlyCents,
      stripePriceId: price.id,
      features: catalogEntry.features,
      isActive: true,
    })
    .onConflictDoNothing({ target: subscriptionPlans.key })
    .returning();
  if (created) return created;

  const [racedPlan] = await db
    .select()
    .from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.key, planKey), eq(subscriptionPlans.isActive, true)))
    .limit(1);
  return racedPlan ?? null;
}

// GET (not a Server Action) so the browser can be redirected straight to
// Stripe's hosted Checkout page — same pattern as /api/stripe/connect for
// the (unrelated) Connect OAuth flow.
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const planKey = request.nextUrl.searchParams.get("plan");
  const trialRequested = request.nextUrl.searchParams.get("trial") === "7";
  const annualBilling = request.nextUrl.searchParams.get("billing") === "annual";
  const billingUrl = new URL("/settings/facturation", origin);
  if (!planKey) {
    return NextResponse.redirect(billingUrl);
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  const userId = data.claims.sub as string;
  const access = await requireOwner(userId);
  if (!access) {
    return NextResponse.redirect(billingUrl);
  }
  const accountId = access.accountId;
  if (isRateLimited(`billing-checkout:${accountId}`, 10)) {
    return NextResponse.redirect(billingUrl);
  }

  const plan = await getOrCreateMarketingPlan(planKey);
  if (!plan || !plan.stripePriceId) {
    return NextResponse.redirect(billingUrl);
  }

  const [user] = await db.select().from(users).where(eq(users.id, accountId)).limit(1);
  if (!user) {
    return NextResponse.redirect(billingUrl);
  }

  const [attribution] = await db
    .select({ id: referralAttributions.id })
    .from(referralAttributions)
    .where(eq(referralAttributions.referredAccountId, accountId))
    .limit(1);

  const stripe = getPlatformStripeClient();

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  if (annualBilling) {
    if (!plan.stripePriceId) return NextResponse.redirect(billingUrl);
    const monthlyPrice = await stripe.prices.retrieve(plan.stripePriceId);
    const productId = typeof monthlyPrice.product === "string" ? monthlyPrice.product : monthlyPrice.product.id;
    lineItems.push({
      price_data: {
        product: productId,
        currency: "eur",
        unit_amount: plan.priceMonthlyCents * 10,
        recurring: { interval: "year" },
      },
      quantity: 1,
    });
  } else {
    if (!plan.stripePriceId) return NextResponse.redirect(billingUrl);
    lineItems.push({ price: plan.stripePriceId, quantity: 1 });
  }

  // Reuse the Stripe Customer created on a prior (even abandoned) checkout
  // attempt instead of minting a new one every time.
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({ email: user.email, metadata: { userId } });
    customerId = customer.id;
    await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, userId));
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: lineItems,
    success_url: new URL(trialRequested ? "/onboarding?trial=1" : "/settings/facturation?checkout=success", origin).toString(),
    cancel_url: new URL("/settings/facturation?checkout=cancelled", origin).toString(),
    client_reference_id: accountId,
    // Set on the Subscription itself (not just this Checkout Session) so
    // the webhook's customer.subscription.* handlers can resolve
    // userId/planId directly — see app/api/webhooks/stripe-billing/route.ts.
    subscription_data: {
      ...(trialRequested ? { trial_period_days: 7 } : {}),
      metadata: {
        userId: accountId,
        planId: plan.id,
        stripePriceId: plan.stripePriceId,
        priceMonthlyCents: String(plan.priceMonthlyCents),
        ...(attribution ? { referralAttributionId: attribution.id } : {}),
      },
    },
  });

  if (!session.url) {
    return NextResponse.redirect(billingUrl);
  }
  return NextResponse.redirect(session.url);
}
