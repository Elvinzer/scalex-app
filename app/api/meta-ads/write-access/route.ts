import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/db";
import { metaAdsConnections } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { getMetaAppCredentials } from "@/lib/meta-ads/config";
import { META_AUTHORIZE_URL, META_WRITE_SCOPES } from "@/lib/meta-ads/protocol";
import { signMetaOAuthState } from "@/lib/meta-ads/oauth-state";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";

const STATE_COOKIE = "meta_ads_oauth_state";
const MODE_COOKIE = "meta_ads_oauth_mode";
const RETURN_COOKIE = "meta_ads_return_to";

function safeReturnPath(value: string | null): string | null {
  if (!value || !value.startsWith("/")) return null;
  if (value.startsWith("/acquisition/ads/meta/") || value === "/integrations") return value;
  return null;
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return NextResponse.redirect(new URL("/sign-in", origin));
  const claimUserId = z.string().uuid().safeParse(data.claims.sub);
  if (!claimUserId.success) return NextResponse.redirect(new URL("/sign-in", origin));
  const access = await requireOwner(claimUserId.data);
  if (!access || !(await hasActiveSubscription(access.accountId))) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }
  const [connection] = await db
    .select({ id: metaAdsConnections.id })
    .from(metaAdsConnections)
    .where(eq(metaAdsConnections.userId, access.accountId))
    .limit(1);
  if (!connection) return NextResponse.redirect(new URL("/integrations", origin));

  const returnTo = safeReturnPath(request.nextUrl.searchParams.get("return_to"));
  const credentials = getMetaAppCredentials();
  if (!credentials) {
    const destination = new URL(returnTo ?? "/integrations", origin);
    destination.searchParams.set("meta_ads_error", "config");
    return NextResponse.redirect(destination);
  }
  const { appId, appSecret } = credentials;
  const state = signMetaOAuthState(randomBytes(24).toString("hex"), access.accountId, appSecret);
  const authorizeUrl = new URL(META_AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", appId);
  authorizeUrl.searchParams.set("redirect_uri", new URL("/api/meta-ads/callback", origin).toString());
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", META_WRITE_SCOPES.join(","));
  authorizeUrl.searchParams.set("auth_type", "rerequest");
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  response.cookies.set(MODE_COOKIE, "write", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  if (returnTo) {
    response.cookies.set(RETURN_COOKIE, returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });
  }
  return response;
}
