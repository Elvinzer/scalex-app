import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createBusinessOAuthState, readBusinessOAuthState } from "./oauth-state";

const actor = "11111111-1111-4111-8111-111111111111";
const business = "22222222-2222-4222-8222-222222222222";

beforeEach(() => vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64")));
afterEach(() => vi.unstubAllEnvs());

describe("business OAuth state", () => {
  it("keeps actor and original business in authenticated opaque state", () => {
    const state = createBusinessOAuthState({ provider: "stripe", userId: actor, businessId: business }, 1000);
    expect(state.nonce).not.toContain(business);
    expect(state.cookie).not.toContain(actor);
    expect(readBusinessOAuthState(state.cookie, state.nonce, "stripe", 1001)).toMatchObject({ userId: actor, businessId: business });
  });

  it("rejects provider substitution, nonce substitution, expiry and ciphertext tampering", () => {
    const state = createBusinessOAuthState({ provider: "stripe", userId: actor, businessId: business }, 1000);
    expect(readBusinessOAuthState(state.cookie, state.nonce, "youtube", 1001)).toBeNull();
    expect(readBusinessOAuthState(state.cookie, "f".repeat(48), "stripe", 1001)).toBeNull();
    expect(readBusinessOAuthState(state.cookie, state.nonce, "stripe", 601000)).toBeNull();
    expect(readBusinessOAuthState((state.cookie[0] === "A" ? "B" : "A") + state.cookie.slice(1), state.nonce, "stripe", 1001)).toBeNull();
  });
});
