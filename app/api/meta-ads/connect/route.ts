import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { META_AUTHORIZE_URL, META_READ_SCOPES } from "@/lib/meta-ads/protocol";
import { signMetaOAuthState } from "@/lib/meta-ads/oauth-state";
import { isRateLimited } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";
import { requireEnv } from "@/lib/utils";

const STATE_COOKIE = "meta_ads_oauth_state";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.redirect(new URL("/sign-in", origin));

  const claimUserId = z.string().uuid().safeParse(data.claims.sub);
  if (!claimUserId.success) return NextResponse.redirect(new URL("/sign-in", origin));
  const access = await requireOwner(claimUserId.data);
  if (!access || isRateLimited(`meta-ads-connect:${access.accountId}`, 10)) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }
  if (!(await hasActiveSubscription(access.accountId))) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const appId = requireEnv("META_APP_ID");
  const appSecret = requireEnv("META_APP_SECRET");
  const nonce = randomBytes(24).toString("hex");
  const state = signMetaOAuthState(nonce, access.accountId, appSecret);
  const authorizeUrl = new URL(META_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", new URL("/api/meta-ads/callback", origin).toString());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", META_READ_SCOPES.join(","));
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
