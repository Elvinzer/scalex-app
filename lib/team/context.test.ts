import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { getDefaultAppRoute, type AccountContext } from "./context";

function memberContext(permissions: string[]): AccountContext {
  return {
    isOwner: false,
    accountId: "account-id",
    permissions: new Set(permissions),
    advancedModulesEnabled: false,
  };
}

describe("post-auth landing route", () => {
  it("keeps a member with no permissions inside the app", () => {
    expect(getDefaultAppRoute(memberContext([]))).toBe("/roadmap");
  });

  it("uses the first accessible member page", () => {
    expect(getDefaultAppRoute(memberContext(["ventes:appels"]))).toBe("/ventes/appels");
  });
});
