import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";

import { readBusinessOAuthState } from "@/lib/integrations/oauth-state";
import { businessHref } from "@/lib/businesses/routing";
import Stripe from "stripe";

import { db } from "@/db";
import { stripeConnections, businesses } from "@/db/schema";
import { encrypt } from "@/lib/crypto";
import { inngest, stripeAccountConnected } from "@/lib/inngest/client";
import { isRateLimited } from "@/lib/rate-limit";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const storedState = request.cookies.get("stripe_oauth_state")?.value;

  const oauthState = readBusinessOAuthState(storedState, state, "stripe");
  if (!code || !oauthState) {
    return NextResponse.redirect(new URL(oauthState ? businessHref(oauthState.businessId, "/integrations") : "/businesses", origin));
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  const userId = data.claims.sub as string;
  // Same owner-only boundary as /api/stripe/connect (the route that starts
  // this flow) — defense in depth in case this callback is ever hit
  // directly.
  if (oauthState.userId !== userId) return NextResponse.redirect(new URL(oauthState ? businessHref(oauthState.businessId, "/integrations") : "/businesses", origin));
  const access = await requireOwner(userId, { businessId: oauthState.businessId });
  if (!access) {
    return NextResponse.redirect(new URL(oauthState ? businessHref(oauthState.businessId, "/integrations") : "/businesses", origin));
  }
  if (isRateLimited(`stripe-callback:${access.accountId}`, 10)) {
    return NextResponse.redirect(new URL(oauthState ? businessHref(oauthState.businessId, "/integrations") : "/businesses", origin));
  }

  const clientSecret = process.env.STRIPE_CONNECT_CLIENT_SECRET;
  if (!clientSecret) {
    console.error("[stripe] STRIPE_CONNECT_CLIENT_SECRET manquant — échange OAuth impossible");
    return NextResponse.redirect(new URL(businessHref(oauthState.businessId, "/integrations?stripe_error=config"), origin));
  }

  const stripe = new Stripe(clientSecret);
  let tokenResponse: Stripe.OAuthToken;
  try {
    tokenResponse = await stripe.oauth.token({ grant_type: "authorization_code", code });
  } catch (error) {
    console.error("[stripe] échange OAuth échoué", { errorName: error instanceof Error ? error.name : "unknown" });
    return NextResponse.redirect(new URL(businessHref(oauthState.businessId, "/integrations?stripe_error=oauth"), origin));
  }

  if (!tokenResponse.access_token || !tokenResponse.stripe_user_id) {
    return NextResponse.redirect(new URL(businessHref(oauthState.businessId, "/integrations?stripe_error=oauth"), origin));
  }

  const values = {
    userId: access.accountId,
    stripeAccountId: tokenResponse.stripe_user_id,
    accessTokenEncrypted: encrypt(tokenResponse.access_token),
    refreshTokenEncrypted: tokenResponse.refresh_token
      ? encrypt(tokenResponse.refresh_token)
      : null,
    scope: tokenResponse.scope ?? null,
    // Always present in practice on an OAuth token response — defaults true
    // to match the column default if Stripe ever omits it. The sync
    // (lib/inngest/functions/sync-stripe-account.ts) refuses to run at all
    // when this is false, so test/live data is never mixed.
    livemode: tokenResponse.livemode ?? true,
    // Reset on every (re)connect — the Inngest job flips this to
    // "completed"/"failed" once the 12-month sync finishes.
    initialSyncStatus: "pending" as const,
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
        set: { ...values, connectedAt: new Date(), initialSyncCompletedAt: null },
      }),
    db.update(businesses).set({ stripeConnectId: tokenResponse.stripe_user_id }).where(eq(businesses.id, access.accountId)),
  ]);

  // Best-effort — the connection itself is already durably saved above by
  // this point. A local Inngest Dev Server hiccup (or Inngest Cloud being
  // briefly unreachable) must never turn a successful Stripe connection into
  // a crashed OAuth callback; the 12-month sync just won't kick off
  // automatically (the "Synchronisation en cours…" banner on /integrations
  // will stay on "pending" until the account reconnects or a Phase 2 resync
  // button exists).
  try {
    await inngest.send(stripeAccountConnected.create({ userId: access.accountId }));
  } catch (error) {
    console.error("inngest.send(stripeAccountConnected) failed, Stripe connection saved anyway", { errorName: error instanceof Error ? error.name : "unknown" });
  }

  revalidateBusinessData(access.accountId);

  const response = NextResponse.redirect(new URL(oauthState ? businessHref(oauthState.businessId, "/integrations") : "/businesses", origin));
  response.cookies.delete("stripe_oauth_state");
  return response;
}
