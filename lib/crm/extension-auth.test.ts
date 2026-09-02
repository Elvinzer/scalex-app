import { describe, expect, it } from "vitest";

import { crmExtensionCompletionPath, isCrmExtensionRedirectUri, readCrmExtensionAuthQuery } from "./extension-auth";

const extensionId = "a".repeat(32);
const redirectUri = `chrome-extension://${extensionId}/auth-callback.html`;
const state = "state_1234567890";

describe("CRM extension auth handoff", () => {
  it("accepts only the extension callback page", () => {
    expect(isCrmExtensionRedirectUri(redirectUri)).toBe(true);
    expect(isCrmExtensionRedirectUri("https://www.minaly.io/auth/callback")).toBe(false);
    expect(isCrmExtensionRedirectUri(`chrome-extension://${extensionId}/other.html`)).toBe(false);
    expect(isCrmExtensionRedirectUri(`${redirectUri}?token=leak`)).toBe(false);
  });

  it("builds an internal completion path from a validated handoff", () => {
    const query = readCrmExtensionAuthQuery(new URLSearchParams({ redirect_uri: redirectUri, state }));
    expect(query).toEqual({ redirect_uri: redirectUri, state });
    expect(query ? crmExtensionCompletionPath(query) : null).toBe(`/extension/auth/complete?redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`);
  });

  it("rejects short or malformed states", () => {
    expect(readCrmExtensionAuthQuery(new URLSearchParams({ redirect_uri: redirectUri, state: "short" }))).toBeNull();
    expect(readCrmExtensionAuthQuery(new URLSearchParams({ redirect_uri: redirectUri, state: "state with spaces" }))).toBeNull();
  });
});
