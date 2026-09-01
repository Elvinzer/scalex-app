import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/team/context", () => ({
  getAccountContext: vi.fn(),
  requireOwner: vi.fn(),
  requirePermission: vi.fn(),
}));

import { getAccountContext } from "@/lib/team/context";

import { hasCrmPermission, requireCrmAccess } from "./access";

const mockedGetAccountContext = vi.mocked(getAccountContext);

describe("CRM access guard", () => {
  it("allows an owner only when the account module is enabled", async () => {
    mockedGetAccountContext.mockResolvedValue({ isOwner: true, accountId: "account-id", permissions: "all", advancedModulesEnabled: false, crmEnabled: true });
    expect(await requireCrmAccess("owner-id")).toMatchObject({ userId: "owner-id", accountId: "account-id", isOwner: true });

    mockedGetAccountContext.mockResolvedValue({ isOwner: true, accountId: "account-id", permissions: "all", advancedModulesEnabled: false, crmEnabled: false });
    expect(await requireCrmAccess("owner-id")).toBeNull();
  });

  it("checks the requested permission for an enabled member", async () => {
    mockedGetAccountContext.mockResolvedValue({ isOwner: false, accountId: "account-id", permissions: new Set(["crm:view"]), advancedModulesEnabled: false, crmEnabled: true });
    expect(await requireCrmAccess("member-id")).toMatchObject({ userId: "member-id", isOwner: false });
    expect(await requireCrmAccess("member-id", "crm:view-team")).toBeNull();
  });

  it("treats owner and all-permission contexts as authorized", () => {
    expect(hasCrmPermission({ userId: "owner-id", accountId: "account-id", isOwner: true, permissions: "all" }, "crm:assign")).toBe(true);
    expect(hasCrmPermission({ userId: "member-id", accountId: "account-id", isOwner: false, permissions: "all" }, "crm:assign")).toBe(true);
    expect(hasCrmPermission({ userId: "member-id", accountId: "account-id", isOwner: false, permissions: new Set(["crm:view"]) }, "crm:assign")).toBe(false);
  });
});
