import { describe, expect, it } from "vitest";

import { DEFAULT_ROLES, PERMISSION_GROUPS, expandPermissionKeys } from "./permissions";

describe("team permission compatibility", () => {
  it("expands the legacy Setting permission to the current sales pages", () => {
    expect([...expandPermissionKeys(["acquisition:setting"])]).toEqual([
      "acquisition:setting",
      "acquisition:pipeline",
      "acquisition:setters",
    ]);
  });

  it("ignores unknown database values", () => {
    expect([...expandPermissionKeys(["unknown", "dashboard"])]).toEqual(["dashboard"]);
  });

  it("exposes first-message test management as a CRM permission and grants it to the default manager", () => {
    const crmGroup = PERMISSION_GROUPS.find((group) => group.key === "crm");
    const manager = DEFAULT_ROLES.find((role) => role.key === "manager");
    expect(crmGroup?.permissions).toContain("crm:manage-message-tests");
    expect(manager?.permissions).toContain("crm:manage-message-tests");
  });
});
