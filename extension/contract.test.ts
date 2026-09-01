import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("./manifest.json", import.meta.url), "utf8")) as {
  manifest_version: number;
  permissions: string[];
  background: { service_worker: string };
  content_scripts: Array<{ js: string[]; matches: string[] }>;
};
const contentSource = readFileSync(new URL("./src/content.ts", import.meta.url), "utf8");
const backgroundSource = readFileSync(new URL("./src/background.ts", import.meta.url), "utf8");

describe("Minaly CRM Chrome extension contract", () => {
  it("uses a minimal Manifest V3 surface", () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions).toEqual(["storage", "tabs"]);
    expect(manifest.background.service_worker).toBe("dist/background.js");
    expect(manifest.content_scripts[0]?.matches).toEqual(expect.arrayContaining([
      "https://www.instagram.com/*",
      "https://www.linkedin.com/*",
    ]));
  });

  it("keeps social capture DOM-only and blocks message automation", () => {
    expect(contentSource).not.toContain("graph.facebook.com");
    expect(contentSource).not.toContain("api.linkedin.com");
    expect(contentSource).not.toContain("send-message");
    expect(contentSource).toContain("document.querySelector");
    expect(contentSource).toContain("profileUrl: profile.canonicalProfileUrl");
    expect(contentSource).toContain("handle: profile.normalizedHandle");
    expect(backgroundSource).toContain("/api/crm/extension/session");
    expect(backgroundSource).toContain("minalyCrmExtensionToken");
  });
});
