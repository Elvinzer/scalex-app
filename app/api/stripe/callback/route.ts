import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import Stripe from "stripe";

import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { inngest, stripeAccountConnected } from "@/lib/inngest/client";
import { createClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("stripe_oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  const userId = data.claims.sub as string;

  const stripe = new Stripe(requireEnv("STRIPE_CONNECT_CLIENT_SECRET"));
  const tokenResponse = await stripe.oauth.token({
    grant_type: "authorization_code",
    code,
  });

  if (!tokenResponse.access_token || !tokenResponse.stripe_user_id) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const values = {
    userId,
    stripeAccountId: tokenResponse.stripe_user_id,
    accessTokenEncrypted: encrypt(tokenResponse.access_token),
    refreshTokenEncrypted: tokenResponse.refresh_token
      ? encrypt(tokenResponse.refresh_token)
      : null,
    scope: tokenResponse.scope ?? null,
  };

  // Independent writes to different tables — run together. inngest.send
  // stays after: the job it triggers reads these two rows, so the event
  // must only fire once both writes are confirmed.
  await Promise.all([
    db
      .insert(stripeConnections)
      .values(values)
      .onConflictDoUpdate({
        target: stripeConnections.userId,
        set: { ...values, connectedAt: new Date() },
      }),
    db.update(users).set({ stripeConnectId: tokenResponse.stripe_user_id }).where(eq(users.id, userId)),
  ]);

  await inngest.send(stripeAccountConnected.create({ userId }));

  const response = NextResponse.redirect(new URL("/integrations", origin));
  response.cookies.delete("stripe_oauth_state");
  return response;
}
