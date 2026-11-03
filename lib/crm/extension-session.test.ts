import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), identity: vi.fn() }));
vi.mock("@/lib/auth/request", () => ({ getAuthIdentity: mocks.identity }));
vi.mock("@/lib/crm/access", () => ({ requireCrmAccess: mocks.access }));

import { createCrmExtensionSession, getCrmExtensionAccess, verifyCrmExtensionSession } from "./extension-session";

const actor = "11111111-1111-4111-8111-111111111111";
const businessA = "22222222-2222-4222-8222-222222222222";

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("CRM_EXTENSION_SESSION_SECRET", "test-only-extension-signing-material".repeat(2)); });
afterEach(() => vi.unstubAllEnvs());

describe("CRM extension business selection", () => {
  it("revalidates the token's original business even after browser selection changes", async () => {
    const access = { userId: actor, accountId: businessA, isOwner: false, permissions: new Set(["crm:view"]) };
    mocks.access.mockResolvedValue(access);
    const token = createCrmExtensionSession(actor, businessA);
    const request = new NextRequest("https://minaly.test/api/crm/extension/resolve", { headers: { Authorization: `Bearer ${token}` } });
    expect(await getCrmExtensionAccess(request)).toEqual(access);
    expect(mocks.access).toHaveBeenCalledWith(actor, "crm:view", businessA);
    expect(mocks.identity).not.toHaveBeenCalled();
  });

  it("does not use cookies or a different business when token membership has been removed", async () => {
    mocks.access.mockResolvedValue(null);
    const token = createCrmExtensionSession(actor, businessA);
    expect(await getCrmExtensionAccess(new NextRequest("https://minaly.test/api/crm/extension/resolve", { headers: { Authorization: `Bearer ${token}` } }))).toBeNull();
    expect(mocks.identity).not.toHaveBeenCalled();
  });

  it("rejects expired, modified and extra-segment tokens", () => {
    const token = createCrmExtensionSession(actor, businessA, 1000);
    expect(token).not.toBeNull();
    expect(verifyCrmExtensionSession(token ?? "", 901000)).toBeNull();
    expect(verifyCrmExtensionSession(`${token}.extra`, 1001)).toBeNull();
    expect(verifyCrmExtensionSession(`${token}modified`, 1001)).toBeNull();
  });
});
