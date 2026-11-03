import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ entitlement: vi.fn(), decrypt: vi.fn(), reserve: vi.fn() }));
vi.mock("@/lib/businesses/entitlements", () => ({ getBusinessEntitlement: mocks.entitlement }));
vi.mock("@/lib/crypto", () => ({ tryDecrypt: mocks.decrypt }));
vi.mock("./quota", () => ({ checkAndIncrementSharedUsage: mocks.reserve }));

import { resolveAgentKey } from "./client";

beforeEach(() => { vi.clearAllMocks(); mocks.entitlement.mockResolvedValue({ active: true }); mocks.decrypt.mockReturnValue(null); });
afterEach(() => vi.unstubAllEnvs());

describe("business AI key boundary", () => {
  it("checks the business before decrypting or reserving shared work", async () => {
    mocks.entitlement.mockResolvedValue({ active: false });
    await expect(resolveAgentKey({ id: "business-b", anthropicApiKeyEncrypted: "encrypted-b" })).rejects.toThrow("business_suspended");
    expect(mocks.decrypt).not.toHaveBeenCalled();
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("uses the supplied business BYOK even when shared requests are disabled", async () => {
    vi.stubEnv("ANTHROPIC_SHARED_DISABLED", "true");
    mocks.decrypt.mockReturnValue("test-business-key");
    expect(await resolveAgentKey({ id: "business-b", anthropicApiKeyEncrypted: "encrypted-b" })).toEqual({ source: "byok", apiKey: "test-business-key" });
    expect(mocks.entitlement).toHaveBeenCalledWith("business-b");
    expect(mocks.reserve).not.toHaveBeenCalled();
  });

  it("attributes fallback reservations to the business rather than its owner", async () => {
    vi.stubEnv("ANTHROPIC_SHARED_API_KEY", "test-shared-key");
    await resolveAgentKey({ id: "business-b", anthropicApiKeyEncrypted: null });
    expect(mocks.reserve).toHaveBeenCalledWith("business-b");
  });
});
