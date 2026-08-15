import { resolvePageContext } from "@/lib/agent/page-context";
import type { SupportTicketContext } from "@/lib/support/types";

const SENSITIVE_QUERY_KEY = /token|code|key|secret|access|auth|signature|state|password|invite/i;

export function sanitizeSupportPathname(value: string): string {
  const fallback = "/dashboard";
  try {
    const url = new URL(value, "https://minaly.local");
    if (url.origin !== "https://minaly.local" || !url.pathname.startsWith("/")) return fallback;

    const safeParams = new URLSearchParams();
    for (const [key, paramValue] of url.searchParams.entries()) {
      if (SENSITIVE_QUERY_KEY.test(key)) continue;
      safeParams.set(key.slice(0, 80), paramValue.slice(0, 120));
    }
    const query = safeParams.toString();
    return `${url.pathname.slice(0, 1_500)}${query ? `?${query}` : ""}`;
  } catch {
    return fallback;
  }
}

export function parseUserAgent(userAgent: string | null): { browser: string; os: string } {
  if (!userAgent) return { browser: "Unknown", os: "Unknown" };

  const browser = userAgent.includes("Edg/")
    ? "Edge"
    : userAgent.includes("Chrome/")
      ? "Chrome"
      : userAgent.includes("Firefox/")
        ? "Firefox"
        : userAgent.includes("Safari/")
          ? "Safari"
          : "Unknown";
  const os = userAgent.includes("Windows")
    ? "Windows"
    : userAgent.includes("Mac OS X")
      ? "macOS"
      : userAgent.includes("Android")
        ? "Android"
        : userAgent.includes("iPhone") || userAgent.includes("iPad")
          ? "iOS"
          : userAgent.includes("Linux")
            ? "Linux"
            : "Unknown";
  return { browser, os };
}

export function buildSupportTicketContext(input: {
  pathname: string;
  locale: "fr" | "en";
  viewport?: { width?: number; height?: number };
  userAgent: string | null;
  now?: Date;
}): SupportTicketContext {
  const pathname = sanitizeSupportPathname(input.pathname);
  const page = resolvePageContext(pathname);
  const { browser, os } = parseUserAgent(input.userAgent);
  const width = input.viewport?.width;
  const height = input.viewport?.height;

  return {
    pageKey: page?.pageKey ?? null,
    pageLabel: page?.label ?? null,
    pathname,
    locale: input.locale,
    browser,
    os,
    userAgent: input.userAgent?.slice(0, 500) ?? null,
    viewport:
      Number.isInteger(width) && Number.isInteger(height) && width && height
        ? { width, height }
        : null,
    capturedAt: (input.now ?? new Date()).toISOString(),
    deploymentVersion: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null,
  };
}

