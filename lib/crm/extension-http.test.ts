import { describe, expect, it } from "vitest";

import { readCrmExtensionBody } from "./extension-http";

describe("CRM extension HTTP boundary", () => {
  it("parses a bounded JSON payload", async () => {
    await expect(readCrmExtensionBody(new Request("https://minaly.app/api/crm/extension/resolve", { method: "POST", body: JSON.stringify({ profileUrl: "https://instagram.com/marc.lefebvre" }) }))).resolves.toEqual({ ok: true, body: { profileUrl: "https://instagram.com/marc.lefebvre" } });
  });

  it("distinguishes malformed JSON from an oversized payload", async () => {
    await expect(readCrmExtensionBody(new Request("https://minaly.app/api/crm/extension/resolve", { method: "POST", body: "{" }))).resolves.toEqual({ ok: false, reason: "invalid_json" });
    await expect(readCrmExtensionBody(new Request("https://minaly.app/api/crm/extension/resolve", { method: "POST", body: "x".repeat(16 * 1024 + 1) }))).resolves.toEqual({ ok: false, reason: "too_large" });
  });
});
