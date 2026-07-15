import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requireEnv } from "@/lib/utils";

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return NextResponse.redirect(new URL("/sign-in", origin));
  }

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = new URL("https://connect.stripe.com/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", requireEnv("STRIPE_CONNECT_CLIENT_ID"));
  authorizeUrl.searchParams.set("scope", "read_only");
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
