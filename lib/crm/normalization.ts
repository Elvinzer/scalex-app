import type { CrmCapturedProfile, CrmPlatform } from "./types";

const PLATFORM_HOSTS: Record<CrmPlatform, string> = {
  instagram: "instagram.com",
  linkedin: "linkedin.com",
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function splitName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.split(" ").filter(Boolean);
  if (parts.length <= 1) return { firstName: displayName, lastName: "" };
  return { firstName: parts[0] ?? displayName, lastName: parts.slice(1).join(" ") };
}

function hostnameFor(platform: CrmPlatform): string {
  return PLATFORM_HOSTS[platform];
}

function canonicalPath(platform: CrmPlatform, url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean).map((part) => part.trim());
  if (parts.length === 0) return null;

  if (platform === "instagram") {
    const handle = parts[0];
    if (!handle || ["accounts", "explore", "direct", "reels", "p", "stories"].includes(handle.toLowerCase())) return null;
    return `/${handle.toLowerCase()}`;
  }

  const section = parts[0]?.toLowerCase();
  const handle = parts[1];
  if (!handle || !section || !["in", "company"].includes(section)) return null;
  return `/${section}/${handle.toLowerCase()}`;
}

export function normalizeProfileUrl(platform: CrmPlatform, rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    const expectedHost = hostnameFor(platform);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (hostname !== expectedHost || url.username || url.password || url.port) return null;
    const path = canonicalPath(platform, url);
    return path ? `https://${expectedHost}${path}` : null;
  } catch {
    return null;
  }
}

export function detectPlatform(rawUrl: string): CrmPlatform | null {
  try {
    const hostname = new URL(rawUrl.trim()).hostname.toLowerCase().replace(/^www\./, "");
    if (hostname === PLATFORM_HOSTS.instagram) return "instagram";
    if (hostname === PLATFORM_HOSTS.linkedin) return "linkedin";
    return null;
  } catch {
    return null;
  }
}

export function normalizeHandle(platform: CrmPlatform, handle: string): string {
  const value = handle.trim().replace(/^@+/, "").replace(/^https?:\/\/[^/]+\//i, "");
  if (platform === "linkedin") return value.replace(/^in\//i, "").replace(/^company\//i, "").split(/[/?#]/)[0]?.toLowerCase() ?? "";
  return value.split(/[/?#]/)[0]?.toLowerCase() ?? "";
}

export function normalizeCapturedProfile(input: {
  profileUrl: string;
  platform?: CrmPlatform | null;
  handle?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  messageOccurredAt?: string | null;
  capturedAt?: string | null;
}): CrmCapturedProfile | null {
  const platform = input.platform ?? detectPlatform(input.profileUrl);
  if (!platform) return null;
  const canonicalProfileUrl = normalizeProfileUrl(platform, input.profileUrl);
  if (!canonicalProfileUrl) return null;
  const pathParts = new URL(canonicalProfileUrl).pathname.split("/").filter(Boolean);
  const urlHandle = platform === "linkedin" ? pathParts[1] : pathParts[0];
  const normalizedHandle = normalizeHandle(platform, input.handle ?? urlHandle ?? "");
  if (!normalizedHandle) return null;
  const displayName = cleanText(input.displayName) || normalizedHandle;
  const split = splitName(displayName);
  const firstName = cleanText(input.firstName) || split.firstName;
  const lastName = cleanText(input.lastName) || split.lastName;
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const validCapturedAt = Number.isNaN(Date.parse(capturedAt)) ? new Date().toISOString() : new Date(capturedAt).toISOString();
  const messageOccurredAt = input.messageOccurredAt && !Number.isNaN(Date.parse(input.messageOccurredAt)) ? new Date(input.messageOccurredAt).toISOString() : null;
  return { platform, canonicalProfileUrl, normalizedHandle, displayName, firstName, lastName, messageOccurredAt, capturedAt: validCapturedAt };
}
