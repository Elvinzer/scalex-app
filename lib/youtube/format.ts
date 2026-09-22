import type { YoutubeVideoInsightRow } from "./queries";

export type VideoFormat = "all" | "short" | "long";

export const VIDEO_FORMATS: { key: VideoFormat; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "short", label: "Shorts" },
  { key: "long", label: "Vidéos longues" },
];

// YouTube Analytics reports the content type used for the view. That is the
// source of truth because duration alone cannot identify a Short anymore.
// Older rows without this field use the duration heuristic until the next
// sync fills the official content type.

export type ResolvedVideoFormat = "short" | "long" | null;
const SHORT_MAX_DURATION_SECONDS = 120;

export function resolveVideoFormat(
  video: Pick<YoutubeVideoInsightRow, "durationSeconds" | "creatorContentType">,
): ResolvedVideoFormat {
  if (video.creatorContentType === "SHORTS") return "short";
  if (video.creatorContentType === "VIDEO_ON_DEMAND") return "long";
  if (video.durationSeconds === null) return null;
  return video.durationSeconds <= SHORT_MAX_DURATION_SECONDS ? "short" : "long";
}

export function isShortFormat(video: Pick<YoutubeVideoInsightRow, "durationSeconds" | "creatorContentType">): boolean {
  return resolveVideoFormat(video) === "short";
}

export function matchesFormat(video: Pick<YoutubeVideoInsightRow, "durationSeconds" | "creatorContentType">, format: VideoFormat): boolean {
  if (format === "all") return true;
  return resolveVideoFormat(video) === format;
}

// Private and unlisted uploads aren't part of a channel's public content
// performance, so they're excluded from /acquisition/contenu entirely.
// A null status means the row predates the privacy_status column (see
// db/schema.ts) — treated as public so an existing library doesn't vanish
// from the UI before its next resync backfills the real value.
export function isPublicVideo(video: Pick<YoutubeVideoInsightRow, "privacyStatus">): boolean {
  return video.privacyStatus === null || video.privacyStatus === "public";
}
