import Stripe from "stripe";

import { requireEnv } from "@/lib/utils";

// Scale X's OWN Stripe account — billing the infopreneur for their Scale X
// subscription. Full SDK access is safe here (unlike
// lib/stripe/read-only-client.ts, which deliberately restricts a connected
// CLIENT's token to list/retrieve): this key is Scale X's own platform
// secret key, the same one already used for the Connect OAuth token
// exchange in app/api/stripe/callback/route.ts — Stripe doesn't issue a
// separate "OAuth client secret" distinct from the platform's normal secret
// key, so there's no new env var to add.
let client: Stripe | null = null;

export function getPlatformStripeClient(): Stripe {
  if (!client) {
    client = new Stripe(requireEnv("STRIPE_CONNECT_CLIENT_SECRET"));
  }
  return client;
}
