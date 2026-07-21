import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { subscriptionPlans, users } from "@/db/schema";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
import { createClient } from "@/lib/supabase/server";

// GET (not a Server Action) so the browser can be redirected straight to
// Stripe's hosted Checkout page — same pattern as /api/stripe/connect for
// the (unrelated) Connect OAuth flow.
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const planKey = request.nextUrl.searchParams.get("plan");
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

  const [plan] = await db
    .select()
    .from(subscriptionPlans)
    .where(and(eq(subscriptionPlans.key, planKey), eq(subscriptionPlans.isActive, true)))
    .limit(1);
  if (!plan || !plan.stripePriceId) {
    return NextResponse.redirect(billingUrl);
  }

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) {
    return NextResponse.redirect(billingUrl);
  }

  const stripe = getPlatformStripeClient();

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
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: new URL("/settings/facturation?checkout=success", origin).toString(),
    cancel_url: new URL("/settings/facturation?checkout=cancelled", origin).toString(),
    client_reference_id: userId,
    // Set on the Subscription itself (not just this Checkout Session) so
    // the webhook's customer.subscription.* handlers can resolve
    // userId/planId directly — see app/api/webhooks/stripe-billing/route.ts.
    subscription_data: { metadata: { userId, planId: plan.id } },
  });

  if (!session.url) {
    return NextResponse.redirect(billingUrl);
  }
  return NextResponse.redirect(session.url);
}
