import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { INSTAGRAM_AUTHORIZE_URL, INSTAGRAM_OAUTH_SCOPES } from "@/lib/instagram/protocol";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";
import { requireEnv } from "@/lib/utils";

// Owner-only, same boundary as Stripe/iClosed/Calendly: connecting Instagram
// grants OAuth access to the account's real content data. Also gated on an
// active subscription (same "content tracking requires a paid plan" rule as
// iClosed/Calendly's call tracking) — checked here rather than only in the
// connection card's rendering, since this route is a plain link, not a
// Server Action that could re-validate on submit.
export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  const access = await requireOwner(data.claims.sub as string);
  if (!access) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const subscribed = await hasActiveSubscription(access.accountId);
  if (!subscribed) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = new URL(INSTAGRAM_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", requireEnv("INSTAGRAM_APP_ID"));
  authorizeUrl.searchParams.set("redirect_uri", new URL("/api/instagram/callback", origin).toString());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", INSTAGRAM_OAUTH_SCOPES.join(","));
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("instagram_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
