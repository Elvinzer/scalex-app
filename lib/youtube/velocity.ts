import { resolveVideoFormat } from "./format";
import type { YoutubeVideoInsightRow, YoutubeVideoSnapshotRow } from "./queries";

export function snapshotViewsAtDay(snapshots: YoutubeVideoSnapshotRow[], publishedAt: Date, days: number): number | null {
  const target = new Date(publishedAt.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return snapshots.find((snapshot) => snapshot.capturedOn >= target)?.views ?? null;
}

export function snapshotImpressionsAtDay(snapshots: YoutubeVideoSnapshotRow[], publishedAt: Date, days: number): number | null {
  const target = new Date(publishedAt.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  return snapshots.find((snapshot) => snapshot.capturedOn >= target)?.impressions ?? null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1]! + sorted[middle]!) / 2 : sorted[middle]!;
}

export function velocityBenchmark(
  video: YoutubeVideoInsightRow,
  videos: YoutubeVideoInsightRow[],
  snapshotsByVideo: Map<string, YoutubeVideoSnapshotRow[]>,
  days: number,
): number | null {
  const values = videos
    .filter((candidate) => candidate.videoId !== video.videoId && candidate.publishedAt < video.publishedAt && resolveVideoFormat(candidate) === "long")
    .sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
    .slice(0, 10)
    .map((candidate) => snapshotViewsAtDay(snapshotsByVideo.get(candidate.videoId) ?? [], candidate.publishedAt, days))
    .filter((value): value is number => value !== null);
  return median(values);
}

export function velocityPercent(value: number | null, benchmark: number | null): number | null {
  if (value === null || benchmark === null || benchmark <= 0) return null;
  return ((value - benchmark) / benchmark) * 100;
}
