import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { getDefaultAppRoute, resolvePostAuthRoute, type AccountContext } from "./context";

function memberContext(permissions: string[]): AccountContext {
  return {
    isOwner: false,
    accountId: "account-id",
    permissions: new Set(permissions),
    advancedModulesEnabled: false,
    crmEnabled: false,
  };
}

function ownerContext(): AccountContext {
  return {
    isOwner: true,
    accountId: "account-id",
    permissions: "all",
    advancedModulesEnabled: false,
    crmEnabled: false,
  };
}

describe("post-auth landing route", () => {
  it("sends an existing owner to the Dashboard after onboarding", () => {
    expect(resolvePostAuthRoute(ownerContext(), true)).toBe("/dashboard");
  });

  it("keeps a new owner in onboarding", () => {
    expect(resolvePostAuthRoute(ownerContext(), false)).toBe("/onboarding");
  });

  it("keeps a member with no permissions inside the app", () => {
    const member = memberContext([]);
    expect(getDefaultAppRoute(member)).toBe("/roadmap");
    expect(resolvePostAuthRoute(member, true)).toBe("/roadmap");
  });

  it("uses the first accessible member page", () => {
    const member = memberContext(["ventes:appels"]);
    expect(getDefaultAppRoute(member)).toBe("/crm/appels");
    expect(resolvePostAuthRoute(member, true)).toBe("/crm/appels");
  });
});
