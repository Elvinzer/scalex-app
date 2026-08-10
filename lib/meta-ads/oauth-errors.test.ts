import { describe, expect, it } from "vitest";

import { classifyMetaOAuthError } from "./oauth-errors";

describe("Meta OAuth error classification", () => {
  it("distinguishes a user denial", () => {
    expect(classifyMetaOAuthError({ error: "access_denied", reason: null, description: null })).toBe("denied");
  });

  it("identifies a redirect URI mismatch", () => {
    expect(classifyMetaOAuthError({ error: "invalid_request", reason: "redirect_uri_mismatch", description: null })).toBe("redirect_uri");
  });

  it("identifies a missing or invalid read permission", () => {
    expect(classifyMetaOAuthError({ error: "invalid_scope", reason: null, description: null })).toBe("ads_read");
  });

  it("falls back to a generic OAuth failure", () => {
    expect(classifyMetaOAuthError({ error: "server_error", reason: null, description: null })).toBe("oauth");
  });
});
