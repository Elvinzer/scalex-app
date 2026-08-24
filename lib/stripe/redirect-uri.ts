export class StripeRedirectUriConfigError extends Error {
  constructor() {
    super("Stripe Connect redirect URI is not configured");
    this.name = "StripeRedirectUriConfigError";
  }
}

/**
 * Stripe compares this value byte-for-byte with the URI registered in the
 * Stripe platform settings. In production it must therefore be explicit and
 * must not follow the host used to open a preview or an alternate domain.
 */
export function getStripeConnectRedirectUri(requestOrigin: string): string {
  const configured = process.env.STRIPE_CONNECT_REDIRECT_URI?.trim();
  if (!configured) {
    if (process.env.NODE_ENV === "production") throw new StripeRedirectUriConfigError();
    return new URL("/api/stripe/callback", requestOrigin).toString();
  }

  let parsed: URL;
  try {
    parsed = new URL(configured);
  } catch {
    throw new StripeRedirectUriConfigError();
  }

  const isAllowedProtocol = parsed.protocol === "https:" || (process.env.NODE_ENV !== "production" && parsed.protocol === "http:");
  if (!isAllowedProtocol || parsed.pathname !== "/api/stripe/callback" || parsed.search || parsed.hash) {
    throw new StripeRedirectUriConfigError();
  }

  return parsed.toString();
}
