const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const INSTAGRAM_MEDIA_PATH_TYPES = new Set(["p", "reel", "reels", "tv"]);

/**
 * Keeps only canonical Instagram media paths. The API sometimes returns a
 * username-qualified path and sometimes omits it; both forms are valid, but
 * query strings and unrelated hosts are not useful as post links.
 */
export function normalizeInstagramPermalink(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !INSTAGRAM_HOSTS.has(url.hostname.toLowerCase()) || url.username || url.password) return null;

    const segments = url.pathname.split("/").filter(Boolean);
    const typeIndex = segments.findIndex((segment) => INSTAGRAM_MEDIA_PATH_TYPES.has(segment.toLowerCase()) || segment.toLowerCase() === "stories");
    if (typeIndex < 0) return null;

    const type = segments[typeIndex]!.toLowerCase();
    const segmentCount = type === "stories" ? typeIndex + 3 : typeIndex + 2;
    if (segments.length < segmentCount || !segments[typeIndex + 1]) return null;

    const path = segments.slice(0, segmentCount).join("/");
    return `https://www.instagram.com/${path}/`;
  } catch {
    return null;
  }
}

export function isInstagramPermalink(value: string | null): value is string {
  return normalizeInstagramPermalink(value) !== null;
}
