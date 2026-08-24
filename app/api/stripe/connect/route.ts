import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { isRateLimited } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { getStripeConnectRedirectUri, StripeRedirectUriConfigError } from "@/lib/stripe/redirect-uri";
import { requireOwner } from "@/lib/team/context";

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
  if (isRateLimited(`stripe-connect:${access.accountId}`, 10)) {
    return NextResponse.redirect(new URL("/integrations", origin));
  }

  // Config manquante (env prod non renseignée) : ne pas crasher en 500 — on
  // renvoie sur /integrations avec une bannière explicite. Le nom de la variable
  // n'est jamais exposé au client.
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  if (!clientId) {
    console.error("[stripe] STRIPE_CONNECT_CLIENT_ID manquant — connexion impossible");
    return NextResponse.redirect(new URL("/integrations?stripe_error=config", origin));
  }

  const state = randomBytes(16).toString("hex");
  const authorizeUrl = new URL("https://connect.stripe.com/oauth/authorize");
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  // Stripe requires "read_write" for Standard accounts — "read_only" is
  // Extension-only, a different platform category. Write access is blocked
  // at the code level instead: see lib/stripe/read-only-client.ts.
  authorizeUrl.searchParams.set("scope", "read_write");
  let redirectUri: string;
  try {
    redirectUri = getStripeConnectRedirectUri(origin);
  } catch (error) {
    if (error instanceof StripeRedirectUriConfigError) {
      console.error("[stripe] STRIPE_CONNECT_REDIRECT_URI is missing or invalid");
      return NextResponse.redirect(new URL("/integrations?stripe_error=redirect_uri", origin));
    }
    throw error;
  }
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
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
