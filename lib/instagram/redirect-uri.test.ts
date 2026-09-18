import { afterEach, describe, expect, it, vi } from "vitest";

import { getInstagramRedirectUri, InstagramRedirectUriConfigError } from "./redirect-uri";

const APP_URL_ENV_NAMES = ["APP_URL", "NEXT_PUBLIC_APP_URL", "VERCEL_ENV", "VERCEL_URL", "INSTAGRAM_REDIRECT_URI"] as const;

function clearEnvironment() {
  for (const name of APP_URL_ENV_NAMES) {
    vi.stubEnv(name, "");
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getInstagramRedirectUri", () => {
  it("uses the explicit callback configured for Meta", () => {
    clearEnvironment();
    vi.stubEnv("INSTAGRAM_REDIRECT_URI", "https://www.minaly.io/api/instagram/callback");

    expect(getInstagramRedirectUri("https://preview.minaly.io")).toBe("https://www.minaly.io/api/instagram/callback");
  });

  it("uses the canonical production URL instead of the request host", () => {
    clearEnvironment();
    vi.stubEnv("NODE_ENV", "production");

    expect(getInstagramRedirectUri("https://minaly.io")).toBe("https://www.minaly.io/api/instagram/callback");
  });

  it("uses the local request origin during development", () => {
    clearEnvironment();
    vi.stubEnv("NODE_ENV", "development");

    expect(getInstagramRedirectUri("http://localhost:3000")).toBe("http://localhost:3000/api/instagram/callback");
  });

  it("rejects a callback with a different path or query string", () => {
    clearEnvironment();
    vi.stubEnv("INSTAGRAM_REDIRECT_URI", "https://www.minaly.io/api/instagram/callback?source=instagram");

    expect(() => getInstagramRedirectUri("https://www.minaly.io")).toThrow(InstagramRedirectUriConfigError);
  });
});
