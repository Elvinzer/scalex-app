import type { CrmCapturedProfile, CrmPlatform } from "./types";
import { normalizeEmail, normalizedPhoneFromWhatsAppUrl } from "./contact";

type ProfilePlatform = Extract<CrmPlatform, "instagram" | "tiktok" | "youtube" | "linkedin" | "x" | "facebook">;

const PROFILE_PLATFORMS: readonly ProfilePlatform[] = ["instagram", "tiktok", "youtube", "linkedin", "x", "facebook"];

const PLATFORM_HOSTS: Record<ProfilePlatform, string> = {
  instagram: "instagram.com",
  tiktok: "tiktok.com",
  youtube: "youtube.com",
  linkedin: "linkedin.com",
  x: "x.com",
  facebook: "facebook.com",
};

function cleanText(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}

function splitName(displayName: string): { firstName: string; lastName: string } {
  const parts = displayName.split(" ").filter(Boolean);
  if (parts.length <= 1) return { firstName: displayName, lastName: "" };
  return { firstName: parts[0] ?? displayName, lastName: parts.slice(1).join(" ") };
}

function isProfilePlatform(platform: CrmPlatform): platform is ProfilePlatform {
  return PROFILE_PLATFORMS.some((candidate) => candidate === platform);
}

function hostnameFor(platform: ProfilePlatform): string {
  return PLATFORM_HOSTS[platform];
}

function canonicalPath(platform: ProfilePlatform, url: URL): string | null {
  const parts = url.pathname.split("/").filter(Boolean).map((part) => part.trim());
  if (parts.length === 0) return null;

  if (platform === "instagram") {
    const handle = parts[0];
    if (!handle || ["accounts", "explore", "direct", "reels", "p", "stories"].includes(handle.toLowerCase())) return null;
    return `/${handle.toLowerCase()}`;
  }

  if (platform === "linkedin") {
    const section = parts[0]?.toLowerCase();
    const handle = parts[1];
    if (!handle || !section || !["in", "company"].includes(section)) return null;
    return `/${section}/${handle.toLowerCase()}`;
  }

  return `/${parts.join("/").toLowerCase()}`;
}

export function normalizeProfileUrl(platform: ProfilePlatform, rawUrl: string): string | null {
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

function normalizeGenericUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl.trim());
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.port) return null;
    const path = url.pathname.replace(/\/{2,}/g, "/").replace(/\/$/, "");
    return `${url.protocol}//${url.hostname.toLowerCase()}${path}${url.search}`;
  } catch {
    return null;
  }
}

export function detectPlatform(rawUrl: string): CrmPlatform | null {
  try {
    const hostname = new URL(rawUrl.trim()).hostname.toLowerCase().replace(/^www\./, "");
    const detected = PROFILE_PLATFORMS.find((platform) => PLATFORM_HOSTS[platform] === hostname);
    if (detected) return detected;
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
  profileUrl?: string | null;
  platform?: CrmPlatform | null;
  handle?: string | null;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  messageOccurredAt?: string | null;
  capturedAt?: string | null;
}): CrmCapturedProfile | null {
  const rawProfileUrl = input.profileUrl?.trim() ?? "";
  const platform = input.platform ?? (rawProfileUrl ? detectPlatform(rawProfileUrl) : null);
  if (!platform) return null;
  const inputHandle = normalizeHandle(platform, input.handle ?? rawProfileUrl);
  if (!inputHandle) return null;
  const canonicalProfileUrl = rawProfileUrl
    ? isProfilePlatform(platform) ? normalizeProfileUrl(platform, rawProfileUrl) : normalizeGenericUrl(rawProfileUrl)
    : isProfilePlatform(platform)
      ? `https://${hostnameFor(platform)}/${platform === "linkedin" ? `in/${inputHandle}` : platform === "tiktok" ? `@${inputHandle}` : inputHandle}`
      : null;
  if (isProfilePlatform(platform) && !canonicalProfileUrl) return null;
  const pathParts = canonicalProfileUrl ? new URL(canonicalProfileUrl).pathname.split("/").filter(Boolean) : [];
  const urlHandle = platform === "linkedin" ? pathParts[1] : pathParts[0];
  const normalizedHandle = normalizeHandle(platform, input.handle ?? urlHandle ?? inputHandle);
  if (!normalizedHandle) return null;
  const displayName = cleanText(input.displayName) || normalizedHandle;
  const split = splitName(displayName);
  const firstName = cleanText(input.firstName) || split.firstName;
  const lastName = cleanText(input.lastName) || split.lastName;
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const validCapturedAt = Number.isNaN(Date.parse(capturedAt)) ? new Date().toISOString() : new Date(capturedAt).toISOString();
  const messageOccurredAt = input.messageOccurredAt && !Number.isNaN(Date.parse(input.messageOccurredAt)) ? new Date(input.messageOccurredAt).toISOString() : null;
  return { platform, canonicalProfileUrl, normalizedHandle, displayName, firstName, lastName, messageOccurredAt, capturedAt: validCapturedAt, email: normalizeEmail(input.email), phone: cleanText(input.phone) || normalizedPhoneFromWhatsAppUrl(canonicalProfileUrl) || null };
}
