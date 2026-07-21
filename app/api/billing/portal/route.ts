import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
import { createClient } from "@/lib/supabase/server";

// GET, redirects straight to Stripe's hosted Billing Portal — same shape as
// /api/billing/checkout.
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const billingUrl = new URL("/settings/facturation", origin);

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  const userId = data.claims.sub as string;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.stripeCustomerId) {
    return NextResponse.redirect(billingUrl);
  }

  const stripe = getPlatformStripeClient();
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: billingUrl.toString(),
  });

  return NextResponse.redirect(session.url);
}
