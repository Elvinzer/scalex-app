import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";
import { requireEnv } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }
  // Owner-only: grants OAuth access to the account's real Stripe payments.
  const access = await requireOwner(data.claims.sub as string);
  if (!access) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = new URL("https://connect.stripe.com/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", requireEnv("STRIPE_CONNECT_CLIENT_ID"));
  // Stripe requires "read_write" for Standard accounts — "read_only" is
  // Extension-only, a different platform category. Write access is blocked
  // at the code level instead: see lib/stripe/read-only-client.ts.
  authorizeUrl.searchParams.set("scope", "read_write");
  authorizeUrl.searchParams.set(
    "redirect_uri",
    new URL("/api/stripe/callback", origin).toString()
  );
  authorizeUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(authorizeUrl);
  response.cookies.set("stripe_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
