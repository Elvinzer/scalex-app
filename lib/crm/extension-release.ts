import { existsSync } from "node:fs";
import path from "node:path";

import extensionManifest from "@/extension/manifest.json";

export type CrmExtensionDistribution = "web_store" | "pilot_package" | "unavailable";

export type CrmExtensionRelease = {
  latestVersion: string;
  currentVersion: string | null;
  updateAvailable: boolean;
  distribution: CrmExtensionDistribution;
  updateUrl: string | null;
  webStoreUrl: string | null;
  packageUrl: string | null;
  packageAvailable: boolean;
};

const chromeVersionPattern = /^(?:\d{1,4})(?:\.\d{1,4}){0,3}$/;
const allowedWebStoreHosts = new Set(["chromewebstore.google.com", "chrome.google.com"]);
const defaultPackagePath = "/downloads/minaly-crm-latest.zip";

export function isChromeExtensionVersion(value: string): boolean {
  return chromeVersionPattern.test(value.trim());
}

export function compareChromeExtensionVersions(left: string, right: string): -1 | 0 | 1 {
  if (!isChromeExtensionVersion(left) || !isChromeExtensionVersion(right)) {
    throw new Error("Invalid Chrome extension version");
  }
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  const segmentCount = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < segmentCount; index += 1) {
    const leftSegment = leftParts[index] ?? 0;
    const rightSegment = rightParts[index] ?? 0;
    if (leftSegment < rightSegment) return -1;
    if (leftSegment > rightSegment) return 1;
  }
  return 0;
}

function normalizeHttpsUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeCrmExtensionStoreUrl(value: string | undefined): string | null {
  const normalized = normalizeHttpsUrl(value);
  if (!normalized) return null;
  try {
    const hostname = new URL(normalized).hostname.toLowerCase();
    return allowedWebStoreHosts.has(hostname) ? normalized : null;
  } catch {
    return null;
  }
}

export function normalizeCrmExtensionPackageUrl(value: string | undefined, packageAvailable: boolean): string | null {
  const trimmed = value?.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return packageAvailable ? trimmed : null;
  return packageAvailable ? normalizeHttpsUrl(trimmed) : null;
}

export function selectCrmExtensionDistribution(
  webStoreUrl: string | null,
  packageUrl: string | null,
): Pick<CrmExtensionRelease, "distribution" | "updateUrl"> {
  if (webStoreUrl) return { distribution: "web_store", updateUrl: webStoreUrl };
  if (packageUrl) return { distribution: "pilot_package", updateUrl: packageUrl };
  return { distribution: "unavailable", updateUrl: null };
}

function defaultPackageAvailable(): boolean {
  return existsSync(path.join(process.cwd(), "public", defaultPackagePath.slice(1)));
}

export function getCrmExtensionRelease(currentVersion?: string): CrmExtensionRelease {
  const latestVersion = extensionManifest.version;
  if (!isChromeExtensionVersion(latestVersion)) throw new Error("The CRM extension manifest has an invalid version");

  const packageAvailable = defaultPackageAvailable() || Boolean(process.env.CRM_EXTENSION_PACKAGE_URL?.trim());
  const webStoreUrl = normalizeCrmExtensionStoreUrl(process.env.CRM_EXTENSION_STORE_URL);
  const packageUrl = normalizeCrmExtensionPackageUrl(process.env.CRM_EXTENSION_PACKAGE_URL, packageAvailable)
    ?? (defaultPackageAvailable() ? defaultPackagePath : null);
  const distribution = selectCrmExtensionDistribution(webStoreUrl, packageUrl);
  const validCurrentVersion = currentVersion && isChromeExtensionVersion(currentVersion) ? currentVersion : null;

  return {
    latestVersion,
    currentVersion: validCurrentVersion,
    updateAvailable: validCurrentVersion ? compareChromeExtensionVersions(validCurrentVersion, latestVersion) < 0 : false,
    distribution: distribution.distribution,
    updateUrl: distribution.updateUrl,
    webStoreUrl,
    packageUrl,
    packageAvailable,
  };
}
