import { and, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { z } from "zod";

import { db } from "@/db";
import { businesses, referralAttributions, subscriptionPlans, subscriptions, users } from "@/db/schema";
import { getAuthIdentity } from "@/lib/auth/request";
import { getBusinessEntitlement } from "@/lib/businesses/entitlements";
import { businessHref } from "@/lib/businesses/routing";
import { isRateLimited } from "@/lib/rate-limit";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
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
  const product = await stripe.products.create({ name: `Minaly ${catalogEntry.name}` }, { idempotencyKey: `plan-product:${planKey}` });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: catalogEntry.priceMonthlyCents,
    currency: "eur",
    recurring: { interval: "month" },
  }, { idempotencyKey: `plan-price:${planKey}:${catalogEntry.priceMonthlyCents}:eur:month` });

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
  const rawBusinessId = request.nextUrl.searchParams.get("business");
  const parsedBusinessId = z.string().uuid().optional().safeParse(rawBusinessId ?? undefined);
  if (!parsedBusinessId.success || (planKey !== null && !/^[a-z0-9-]{1,100}$/.test(planKey))) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const identity = await getAuthIdentity();
  if (!identity) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  const access = await requireOwner(identity.userId, { allowSuspended: true, businessId: parsedBusinessId.data });
  if (!access) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const accountId = access.accountId;
  const billingUrl = new URL(businessHref(accountId, "/settings/facturation"), origin);
  if (!planKey || (await getBusinessEntitlement(accountId)).isExempt) return NextResponse.redirect(billingUrl);
  if (isRateLimited(`billing-checkout:${accountId}`, 10)) {
    return NextResponse.redirect(billingUrl);
  }

  let plan: Awaited<ReturnType<typeof getOrCreateMarketingPlan>>;
  try {
    plan = await getOrCreateMarketingPlan(planKey);
  } catch {
    billingUrl.searchParams.set("checkout", "failed");
    return NextResponse.redirect(billingUrl);
  }
  if (!plan || !plan.stripePriceId) {
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
    const monthlyPrice = z.object({ product: z.union([z.string().min(1), z.object({ id: z.string().min(1) })]) })
      .parse(await stripe.prices.retrieve(plan.stripePriceId));
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

  try {
    const destination = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`billing:${accountId}`}, 0))`);
      const [business] = await tx.select({ business: businesses, email: users.email })
        .from(businesses).innerJoin(users, eq(businesses.ownerUserId, users.id))
        .where(and(eq(businesses.id, accountId), eq(businesses.ownerUserId, identity.userId))).limit(1);
      if (!business || business.business.status === "archived") return billingUrl.toString();
      const [current] = await tx.select().from(subscriptions).where(eq(subscriptions.userId, accountId)).limit(1);
      if (current?.stripeSubscriptionId && !["canceled", "incomplete_expired"].includes(current.status)) {
        return new URL(`/api/billing/portal?business=${accountId}`, origin).toString();
      }
      const previousSessionId = business.business.checkoutSessionId;
      if (previousSessionId) {
        const previous = z.object({ status: z.enum(["open", "complete", "expired"]).nullable(), url: z.string().url().nullable(), expires_at: z.number().int() })
          .parse(await stripe.checkout.sessions.retrieve(previousSessionId));
        if (previous.status === "open" && previous.url && previous.expires_at * 1000 > Date.now()) return previous.url;
        if (previous.status === "complete") {
          billingUrl.searchParams.set("checkout", "processing");
          return billingUrl.toString();
        }
      }
      let customerId = business.business.stripeCustomerId;
      if (!customerId) {
        const customer = z.object({ id: z.string().min(1) }).parse(await stripe.customers.create({
          email: business.email, name: business.business.name, metadata: { businessId: accountId },
        }, { idempotencyKey: `business-customer:${accountId}` }));
        customerId = customer.id;
        await tx.update(businesses).set({ stripeCustomerId: customerId }).where(eq(businesses.id, accountId));
      }
      const withTrial = trialRequested && business.business.isInitial && !current;
      const successUrl = new URL(businessHref(accountId, withTrial ? "/onboarding" : "/settings/facturation"), origin);
      successUrl.searchParams.set("checkout", "success");
      const cancelUrl = new URL(billingUrl);
      cancelUrl.searchParams.set("checkout", "cancelled");
      const session = z.object({
        id: z.string().min(1), url: z.string().url().nullable(), expires_at: z.number().int().positive(),
      }).parse(await stripe.checkout.sessions.create({
        mode: "subscription", customer: customerId, line_items: lineItems,
        success_url: successUrl.toString(), cancel_url: cancelUrl.toString(), client_reference_id: accountId,
        metadata: { businessId: accountId },
        subscription_data: {
          ...(withTrial ? { trial_period_days: 7 } : {}),
          metadata: {
            businessId: accountId, userId: accountId, planId: plan.id,
            stripePriceId: plan.stripePriceId ?? "", priceMonthlyCents: String(plan.priceMonthlyCents),
            ...(attribution ? { referralAttributionId: attribution.id } : {}),
          },
        },
      }, { idempotencyKey: `business-checkout:${accountId}:${plan.id}:${annualBilling ? "year" : "month"}:${previousSessionId ?? "first"}` }));
      if (!session.url) throw new Error("checkout_url_missing");
      await tx.update(businesses).set({
        checkoutSessionId: session.id, checkoutSessionUrl: session.url, checkoutSessionExpiresAt: new Date(session.expires_at * 1000),
      }).where(eq(businesses.id, accountId));
      return session.url;
    });
    return NextResponse.redirect(destination);
  } catch {
    billingUrl.searchParams.set("checkout", "failed");
    return NextResponse.redirect(billingUrl);
  }
}
