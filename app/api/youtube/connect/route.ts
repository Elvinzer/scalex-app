import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { isRateLimited } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";
import { requireEnv } from "@/lib/utils";
import { YOUTUBE_AUTHORIZE_URL, YOUTUBE_OAUTH_SCOPES } from "@/lib/youtube/protocol";

// Owner-only, same boundary as Stripe/iClosed/Calendly/Instagram: connecting
// YouTube grants OAuth access to the channel's real analytics data. Also
// gated on an active subscription (same "content tracking requires a paid
// plan" rule as Instagram) — checked here rather than only in the
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
  if (isRateLimited(`youtube-connect:${access.accountId}`, 10)) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const subscribed = await hasActiveSubscription(access.accountId);
  if (!subscribed) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = new URL(YOUTUBE_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", requireEnv("YOUTUBE_CLIENT_ID"));
  authorizeUrl.searchParams.set("redirect_uri", new URL("/api/youtube/callback", origin).toString());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", YOUTUBE_OAUTH_SCOPES.join(" "));
  authorizeUrl.searchParams.set("state", state);
  // Required to receive a refresh_token — see protocol.ts's file header:
  // Google only issues one on first consent unless prompt=consent forces
  // re-issuance on every authorization, including a reconnect.
  authorizeUrl.searchParams.set("access_type", "offline");
  authorizeUrl.searchParams.set("prompt", "consent");

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("youtube_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
