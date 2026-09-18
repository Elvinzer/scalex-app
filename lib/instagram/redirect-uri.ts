import { getAppUrl } from "@/lib/utils";

const INSTAGRAM_CALLBACK_PATH = "/api/instagram/callback";

export class InstagramRedirectUriConfigError extends Error {
  constructor() {
    super("Instagram redirect URI is missing or invalid");
    this.name = "InstagramRedirectUriConfigError";
  }
}

/**
 * Instagram compares this value exactly with the URI registered in Business
 * Login settings. Keep it stable across the authorization and token exchange
 * requests instead of deriving it from an alternate production hostname.
 */
export function getInstagramRedirectUri(requestOrigin: string): string {
  const configured = process.env.INSTAGRAM_REDIRECT_URI?.trim() || undefined;
  const baseUrl = configured
    ? configured
    : process.env.NODE_ENV === "production"
      ? getAppUrl()
      : requestOrigin;

  let parsed: URL;
  try {
    parsed = new URL(configured ?? new URL(INSTAGRAM_CALLBACK_PATH, baseUrl).toString());
  } catch {
    throw new InstagramRedirectUriConfigError();
  }

  const isAllowedProtocol = parsed.protocol === "https:" || (process.env.NODE_ENV !== "production" && parsed.protocol === "http:");
  if (!isAllowedProtocol || parsed.pathname !== INSTAGRAM_CALLBACK_PATH || parsed.search || parsed.hash) {
    throw new InstagramRedirectUriConfigError();
  }

  return parsed.toString();
}
