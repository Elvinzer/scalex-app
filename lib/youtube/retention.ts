import { YOUTUBE_RETENTION_MIN_VIEWS } from "./protocol";
import type { YoutubeVideoInsightRow } from "./queries";

// Everything derived from youtube_video_insights.retentionCurve — the raw
// 100-point audienceRetention report. Per CLAUDE.md's "compute rates in
// code, never store them" rule, nothing here is persisted: the curve is the
// only stored artefact, every figure below is recomputed on read.

export type RetentionPoint = { ratio: number; watchRatio: number };

// The moment the audience first falls below half. Expressed in seconds
// (needs the video's own duration) because "they leave at 2:10" is
// actionable where "they leave at 34% of the video" is not.
const DROP_OFF_THRESHOLD = 0.5;

// The window YouTube creators actually call "the hook". Measured as a
// fraction of the video so it maps onto elapsedVideoTimeRatio.
const HOOK_SECONDS = 30;

export function hasUsableRetention(video: Pick<YoutubeVideoInsightRow, "retentionCurve" | "views">): boolean {
  return (
    Array.isArray(video.retentionCurve) &&
    video.retentionCurve.length > 0 &&
    (video.views ?? 0) >= YOUTUBE_RETENTION_MIN_VIEWS
  );
}

// Seconds into the video where retention first drops under 50%, or null when
// it never does (a video that holds half its audience to the end — worth
// saying so rather than inventing a drop-off).
export function dropOffSeconds(video: Pick<YoutubeVideoInsightRow, "retentionCurve" | "views" | "durationSeconds">): number | null {
  if (!hasUsableRetention(video) || !video.durationSeconds) return null;
  const point = (video.retentionCurve as RetentionPoint[]).find((p) => p.watchRatio < DROP_OFF_THRESHOLD);
  return point ? Math.round(point.ratio * video.durationSeconds) : null;
}

// Share of viewers still watching at the 30-second mark, 0-1. Null for
// videos shorter than the hook window — there is no "after 30s" to measure.
//
// Clamped at 1 on purpose: YouTube's audienceWatchRatio is "views of this
// moment / views of the video", so a re-watched segment goes ABOVE 1 (very
// common on Shorts, which loop). Read as "share of viewers still present"
// that's nonsense — 110% of an audience cannot be watching. Above 1 simply
// means everyone was still there and some rewound, which is exactly 100%
// still present. Kept raw in the stored curve, clamped only at read.
export function hookRetention(video: Pick<YoutubeVideoInsightRow, "retentionCurve" | "views" | "durationSeconds">): number | null {
  if (!hasUsableRetention(video) || !video.durationSeconds || video.durationSeconds <= HOOK_SECONDS) return null;
  const target = HOOK_SECONDS / video.durationSeconds;
  const curve = video.retentionCurve as RetentionPoint[];
  const closest = curve.reduce((best, p) => (Math.abs(p.ratio - target) < Math.abs(best.ratio - target) ? p : best));
  return Math.min(1, closest.watchRatio);
}

export function formatTimecode(seconds: number): string {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// Median rather than mean: one video whose audience leaves at 0:05 would
// drag an average down and misrepresent the channel's typical behaviour.
export function medianDropOffSeconds(videos: Pick<YoutubeVideoInsightRow, "retentionCurve" | "views" | "durationSeconds">[]): number | null {
  const values = videos.map(dropOffSeconds).filter((v): v is number => v !== null).sort((a, b) => a - b);
  if (values.length === 0) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 === 0 ? Math.round((values[middle - 1] + values[middle]) / 2) : values[middle];
}

export function averageHookRetention(videos: Pick<YoutubeVideoInsightRow, "retentionCurve" | "views" | "durationSeconds">[]): number | null {
  const values = videos.map(hookRetention).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// YouTube's raw dimension values are SCREAMING_SNAKE and meaningless to a
// coach — mapped to the wording YouTube Studio itself uses in French.
const TRAFFIC_SOURCE_LABELS: Record<string, string> = {
  YT_SEARCH: "Recherche YouTube",
  RELATED_VIDEO: "Vidéos suggérées",
  BROWSE: "Page d'accueil / Explorer",
  YT_CHANNEL: "Ta chaîne",
  EXT_URL: "Sites externes",
  NOTIFICATION: "Notifications",
  PLAYLIST: "Playlists",
  SUBSCRIBER: "Abonnements",
  YT_OTHER_PAGE: "Autres pages YouTube",
  NO_LINK_OTHER: "Source inconnue",
  NO_LINK_EMBEDDED: "Lecteur intégré",
  ADVERTISING: "Publicité",
  END_SCREEN: "Écrans de fin",
  SHORTS: "Flux Shorts",
  HASHTAGS: "Hashtags",
  SOUND_PAGE: "Page du son",
};

export function trafficSourceLabel(source: string): string {
  return TRAFFIC_SOURCE_LABELS[source] ?? source;
}

// Channel-wide traffic mix: sums each source across the videos that have the
// data, biggest first. Returns [] rather than a zeroed shape when nothing is
// available, so callers hide the block instead of rendering empty bars.
export function aggregateTrafficSources(
  videos: Pick<YoutubeVideoInsightRow, "trafficSources">[]
): { source: string; label: string; views: number; share: number }[] {
  const totals = new Map<string, number>();
  for (const video of videos) {
    for (const entry of video.trafficSources ?? []) {
      totals.set(entry.source, (totals.get(entry.source) ?? 0) + entry.views);
    }
  }
  const grandTotal = Array.from(totals.values()).reduce((sum, v) => sum + v, 0);
  if (grandTotal === 0) return [];
  return Array.from(totals.entries())
    .map(([source, views]) => ({ source, label: trafficSourceLabel(source), views, share: views / grandTotal }))
    .sort((a, b) => b.views - a.views);
}

export function aggregateSearchTerms(
  videos: Pick<YoutubeVideoInsightRow, "searchTerms">[],
  limit = 8
): { term: string; views: number }[] {
  const totals = new Map<string, number>();
  for (const video of videos) {
    for (const entry of video.searchTerms ?? []) {
      totals.set(entry.term, (totals.get(entry.term) ?? 0) + entry.views);
    }
  }
  return Array.from(totals.entries())
    .map(([term, views]) => ({ term, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, limit);
}
