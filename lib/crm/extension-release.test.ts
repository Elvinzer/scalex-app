import { afterEach, describe, expect, it } from "vitest";

import {
  compareChromeExtensionVersions,
  getCrmExtensionRelease,
  normalizeCrmExtensionPackageUrl,
  normalizeCrmExtensionStoreUrl,
  selectCrmExtensionDistribution,
} from "./extension-release";

const originalStoreUrl = process.env.CRM_EXTENSION_STORE_URL;
const originalPackageUrl = process.env.CRM_EXTENSION_PACKAGE_URL;

afterEach(() => {
  if (originalStoreUrl === undefined) delete process.env.CRM_EXTENSION_STORE_URL;
  else process.env.CRM_EXTENSION_STORE_URL = originalStoreUrl;
  if (originalPackageUrl === undefined) delete process.env.CRM_EXTENSION_PACKAGE_URL;
  else process.env.CRM_EXTENSION_PACKAGE_URL = originalPackageUrl;
});

describe("CRM extension release metadata", () => {
  it("compares Chrome versions numerically and pads missing segments", () => {
    expect(compareChromeExtensionVersions("1.10.0", "1.2.9")).toBe(1);
    expect(compareChromeExtensionVersions("0.2", "0.2.0")).toBe(0);
    expect(compareChromeExtensionVersions("0.1.9", "0.2.0")).toBe(-1);
  });

  it("accepts only HTTPS Web Store URLs", () => {
    expect(normalizeCrmExtensionStoreUrl("https://chromewebstore.google.com/detail/minaly/abc")).toBe("https://chromewebstore.google.com/detail/minaly/abc");
    expect(normalizeCrmExtensionStoreUrl("http://chromewebstore.google.com/detail/minaly/abc")).toBeNull();
    expect(normalizeCrmExtensionStoreUrl("https://example.com/minaly")).toBeNull();
  });

  it("supports a relative pilot package only when it exists", () => {
    expect(normalizeCrmExtensionPackageUrl("/downloads/minaly-crm-latest.zip", true)).toBe("/downloads/minaly-crm-latest.zip");
    expect(normalizeCrmExtensionPackageUrl("/downloads/minaly-crm-latest.zip", false)).toBeNull();
    expect(normalizeCrmExtensionPackageUrl("https://downloads.example.com/minaly.zip", true)).toBe("https://downloads.example.com/minaly.zip");
  });

  it("always prefers the Web Store over the pilot package", () => {
    expect(selectCrmExtensionDistribution("https://chromewebstore.google.com/detail/minaly/abc", "/downloads/minaly-crm-latest.zip")).toEqual({ distribution: "web_store", updateUrl: "https://chromewebstore.google.com/detail/minaly/abc" });
    expect(selectCrmExtensionDistribution(null, "/downloads/minaly-crm-latest.zip")).toEqual({ distribution: "pilot_package", updateUrl: "/downloads/minaly-crm-latest.zip" });
    expect(selectCrmExtensionDistribution(null, null)).toEqual({ distribution: "unavailable", updateUrl: null });
  });

  it("returns a minimal public release model with an update decision", () => {
    process.env.CRM_EXTENSION_STORE_URL = "https://chromewebstore.google.com/detail/minaly/abc";
    delete process.env.CRM_EXTENSION_PACKAGE_URL;
    const release = getCrmExtensionRelease("0.1.0");
    expect(release.latestVersion).toBe("0.2.0");
    expect(release.currentVersion).toBe("0.1.0");
    expect(release.updateAvailable).toBe(true);
    expect(release.distribution).toBe("web_store");
    expect(release.updateUrl).toBe("https://chromewebstore.google.com/detail/minaly/abc");
    expect(release).not.toHaveProperty("CRM_EXTENSION_SESSION_SECRET");
  });
});
