import { describe, expect, it } from "vitest";

import { hasSupportStaffPermission } from "@/lib/staff/permission-rules";

describe("support staff permissions", () => {
  it("only grants the explicit support permission", () => {
    expect(hasSupportStaffPermission(new Set(["support:tickets"]), "support:tickets")).toBe(true);
    expect(hasSupportStaffPermission(new Set(), "support:tickets")).toBe(false);
  });
});
