import { describe, expect, it } from "vitest";

import { expandPermissionKeys } from "./permissions";

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
});
