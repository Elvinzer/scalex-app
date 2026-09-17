import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";

import { GET } from "./route";

const originalStoreUrl = process.env.CRM_EXTENSION_STORE_URL;
const originalPackageUrl = process.env.CRM_EXTENSION_PACKAGE_URL;

afterEach(() => {
  if (originalStoreUrl === undefined) delete process.env.CRM_EXTENSION_STORE_URL;
  else process.env.CRM_EXTENSION_STORE_URL = originalStoreUrl;
  if (originalPackageUrl === undefined) delete process.env.CRM_EXTENSION_PACKAGE_URL;
  else process.env.CRM_EXTENSION_PACKAGE_URL = originalPackageUrl;
});

describe("GET /api/crm/extension/release", () => {
  it("returns the current release and update decision without account data", async () => {
    process.env.CRM_EXTENSION_STORE_URL = "https://chromewebstore.google.com/detail/minaly/abc";
    process.env.CRM_EXTENSION_PACKAGE_URL = "/downloads/minaly-crm-latest.zip";
    const request = new NextRequest("http://localhost:3000/api/crm/extension/release?currentVersion=0.1.0", {
      headers: { "x-forwarded-for": "release-route-test-1" },
    });

    const response = await GET(request);
    const body = await response.json() as { data: Record<string, unknown> };
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("max-age=60");
    expect(body.data.latestVersion).toBe("0.2.0");
    expect(body.data.updateAvailable).toBe(true);
    expect(body.data.distribution).toBe("web_store");
    expect(body.data.updateUrl).toBe("https://chromewebstore.google.com/detail/minaly/abc");
    expect(body.data).not.toHaveProperty("accountId");
    expect(body.data).not.toHaveProperty("token");
  });

  it("rejects malformed versions and unexpected query fields", async () => {
    const malformed = await GET(new NextRequest("http://localhost:3000/api/crm/extension/release?currentVersion=latest", {
      headers: { "x-forwarded-for": "release-route-test-2" },
    }));
    const unexpected = await GET(new NextRequest("http://localhost:3000/api/crm/extension/release?debug=1", {
      headers: { "x-forwarded-for": "release-route-test-3" },
    }));
    expect(malformed.status).toBe(400);
    expect(unexpected.status).toBe(400);
  });
});
