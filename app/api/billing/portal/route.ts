import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { businesses } from "@/db/schema";
import { getAuthIdentity } from "@/lib/auth/request";
import { businessHref } from "@/lib/businesses/routing";
import { isRateLimited } from "@/lib/rate-limit";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
import { requireOwner } from "@/lib/team/context";

// GET, redirects straight to Stripe's hosted Billing Portal — same shape as
// /api/billing/checkout.
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const parsed = z.string().uuid().optional().safeParse(request.nextUrl.searchParams.get("business") ?? undefined);
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  const identity = await getAuthIdentity();
  if (!identity) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  const access = await requireOwner(identity.userId, { allowSuspended: true, businessId: parsed.data });
  if (!access) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const billingUrl = new URL(businessHref(access.accountId, "/settings/facturation"), origin);
  if (isRateLimited(`billing-portal:${access.accountId}`, 10)) {
    return NextResponse.redirect(billingUrl);
  }

  const [business] = await db.select({ stripeCustomerId: businesses.stripeCustomerId }).from(businesses)
    .where(eq(businesses.id, access.accountId)).limit(1);
  if (!business?.stripeCustomerId) {
    return NextResponse.redirect(billingUrl);
  }

  try {
    const session = z.object({ url: z.string().url() }).parse(await getPlatformStripeClient().billingPortal.sessions.create({
      customer: business.stripeCustomerId, return_url: billingUrl.toString(),
    }));
    return NextResponse.redirect(session.url);
  } catch {
    billingUrl.searchParams.set("portal", "failed");
    return NextResponse.redirect(billingUrl);
  }
}
