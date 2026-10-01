import { describe, expect, it } from "vitest";

import { safeCrmReturnPath } from "./return-path";

describe("safeCrmReturnPath", () => {
  it("keeps the CRM list and its filters", () => {
    expect(safeCrmReturnPath("/crm/leads?platform=instagram&search=camille")).toBe("/crm/leads?platform=instagram&search=camille");
  });

  it("accepts supported CRM list destinations", () => {
    expect(safeCrmReturnPath("/crm/appels?page=2")).toBe("/crm/appels?page=2");
  });

  it.each(["https://example.com", "//example.com", "/crm/leads/lead-id", "/settings", "/crm%2Fleads", "/crm\\\\example.com"]) (
    "rejects an unsafe or unsupported return path: %s",
    (value) => expect(safeCrmReturnPath(value)).toBeNull(),
  );
});
