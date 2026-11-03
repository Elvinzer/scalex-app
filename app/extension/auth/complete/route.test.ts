import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ identity: vi.fn(), access: vi.fn(), ensure: vi.fn() }));
vi.mock("@/lib/auth/request", () => ({ getAuthIdentity: mocks.identity }));
vi.mock("@/lib/current-user", () => ({ ensureUserRow: mocks.ensure }));
vi.mock("@/lib/crm/access", () => ({ requireCrmAccess: mocks.access }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: () => false }));

import { GET } from "./route";
import { verifyCrmExtensionSession } from "@/lib/crm/extension-session";

const actor = "11111111-1111-4111-8111-111111111111";
const businessB = "22222222-2222-4222-8222-222222222222";
const callback = `chrome-extension://${"a".repeat(32)}/auth-callback.html`;
function request(businessId?: string) {
  const url = new URL("https://www.minaly.test/extension/auth/complete");
  url.searchParams.set("redirect_uri", callback);
  url.searchParams.set("state", "handoff_state_12345");
  if (businessId) url.searchParams.set("businessId", businessId);
  return new Request(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CRM_EXTENSION_SESSION_SECRET", "test-only-extension-handoff-signing-material");
  mocks.identity.mockResolvedValue({ userId: actor, email: "actor@example.test" });
  mocks.access.mockImplementation(async (_actor, _permission, businessId) => businessId === businessB ? { userId: actor, accountId: businessB } : null);
});
afterEach(() => vi.unstubAllEnvs());

describe("extension business handoff", () => {
  it("requires a business choice instead of selecting the first accessible business", async () => {
    const response = await GET(request());
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/extension/auth/select");
    expect(location.searchParams.get("redirect_uri")).toBe(callback);
    expect(location.searchParams.get("state")).toBe("handoff_state_12345");
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("issues a token for explicitly chosen B even if browser navigation is on A", async () => {
    const response = await GET(request(businessB));
    const location = new URL(response.headers.get("location") ?? "");
    expect(mocks.access).toHaveBeenCalledWith(actor, "crm:view", businessB);
    expect(location.origin).toBe("null");
    expect(location.protocol).toBe("chrome-extension:");
    expect(verifyCrmExtensionSession(location.searchParams.get("token") ?? "")).toEqual({ userId: actor, accountId: businessB });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("rechecks access before issuing a token", async () => {
    mocks.access.mockResolvedValue(null);
    const response = await GET(request(businessB));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.searchParams.get("token")).toBeNull();
    expect(location.searchParams.get("error")).toBe("crm_unavailable");
  });

  it("rejects malformed or conflicting business IDs", async () => {
    expect((await GET(request("invalid"))).status).toBe(400);
    const duplicate = new URL(request(businessB).url);
    duplicate.searchParams.append("businessId", actor);
    expect((await GET(new Request(duplicate))).status).toBe(400);
    expect(mocks.access).not.toHaveBeenCalled();
  });

  it("preserves the handoff through sign-in and requires selection after authentication", async () => {
    mocks.identity.mockResolvedValue(null);
    const response = await GET(request(businessB));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/sign-in");
    expect(location.searchParams.get("redirect_uri")).toBe(callback);
    expect(location.searchParams.get("businessId")).toBeNull();
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
