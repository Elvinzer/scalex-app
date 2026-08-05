import type { YoutubeVideoInsightRow } from "./queries";

export type VideoFormat = "all" | "short" | "long";

export const VIDEO_FORMATS: { key: VideoFormat; label: string }[] = [
  { key: "all", label: "Tous" },
  { key: "short", label: "Shorts" },
  { key: "long", label: "Vidéos longues" },
];

// The YouTube Data API exposes no "is this a Short" flag — duration <= 120 seconds
// is the de facto heuristic used across the ecosystem in its absence. A
// video with no duration on file (rare: contentDetails.duration missing
// from the API response) is bucketed as long-form rather than left
// unclassified, since almost everything on a typical channel is long-form.
const SHORT_MAX_DURATION_SECONDS = 120;

export function isShortFormat(durationSeconds: number | null): boolean {
  return durationSeconds !== null && durationSeconds <= SHORT_MAX_DURATION_SECONDS;
}

export function matchesFormat(video: Pick<YoutubeVideoInsightRow, "durationSeconds">, format: VideoFormat): boolean {
  if (format === "all") return true;
  return isShortFormat(video.durationSeconds) === (format === "short");
}

// Private and unlisted uploads aren't part of a channel's public content
// performance, so they're excluded from /acquisition/contenu entirely.
// A null status means the row predates the privacy_status column (see
// db/schema.ts) — treated as public so an existing library doesn't vanish
// from the UI before its next resync backfills the real value.
export function isPublicVideo(video: Pick<YoutubeVideoInsightRow, "privacyStatus">): boolean {
  return video.privacyStatus === null || video.privacyStatus === "public";
}
