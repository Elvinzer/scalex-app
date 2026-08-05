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
