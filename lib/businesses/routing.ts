import { z } from "zod";

export const BUSINESS_HEADER = "x-minaly-business-id";
export const PATHNAME_HEADER = "x-minaly-pathname";
export const SEARCH_HEADER = "x-minaly-search";
export const businessIdSchema = z.string().uuid();

export function getBusinessIdFromPath(path: string): string | null {
  const match = /^\/b\/([^/?#]+)(?:\/|$)/.exec(path);
  const parsed = businessIdSchema.safeParse(match?.[1]);
  return parsed.success ? parsed.data : null;
}

export function stripBusinessPrefix(path: string): string {
  return getBusinessIdFromPath(path) ? path.replace(/^\/b\/[^/?#]+/, "") || "/" : path;
}

export function businessHref(businessId: string, path: string): string {
  businessIdSchema.parse(businessId);
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (/^\/(?:admin|auth|invite|book|sign-in|sign-up|api\/auth)(?:\/|\?|$)/.test(path)) return path;
  return `/b/${businessId}${stripBusinessPrefix(path) === "/" ? "/dashboard" : stripBusinessPrefix(path)}`;
}

export function isBusinessAppPath(path: string): boolean {
  return /^\/(?:dashboard|diagnostic|diagnostic-app|datas|business|businesses|acquisition|ventes|delivrabilite|crm|settings|integrations|avance|copilote|roadmap|onboarding|demarrer|journal|parrainage|reglages|support)(?:\/|$)/.test(path);
}

export function businessFromReferer(referer: string | null, origin: string): string | null {
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return url.origin === origin ? getBusinessIdFromPath(url.pathname) : null;
  } catch {
    return null;
  }
}
