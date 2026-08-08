import { describe, expect, it } from "vitest";

import { signMetaOAuthState, verifyMetaOAuthState } from "./oauth-state";

describe("Meta OAuth state", () => {
  const accountId = "11111111-1111-4111-8111-111111111111";
  const secret = "meta-app-secret-for-tests";

  it("round-trips a state for the same account", () => {
    const state = signMetaOAuthState("nonce-123", accountId, secret);

    expect(verifyMetaOAuthState(state, accountId, secret)).toBe(true);
  });

  it("rejects a state reused for another account or secret", () => {
    const state = signMetaOAuthState("nonce-123", accountId, secret);

    expect(verifyMetaOAuthState(state, "22222222-2222-4222-8222-222222222222", secret)).toBe(false);
    expect(verifyMetaOAuthState(state, accountId, "another-secret")).toBe(false);
  });

  it("rejects malformed or tampered states", () => {
    const state = signMetaOAuthState("nonce-123", accountId, secret);

    expect(verifyMetaOAuthState("", accountId, secret)).toBe(false);
    expect(verifyMetaOAuthState("nonce-only", accountId, secret)).toBe(false);
    expect(verifyMetaOAuthState(`${state}tampered`, accountId, secret)).toBe(false);
  });
});
