export const YOUTUBE_REACH_STATUSES = [
  "pending",
  "available",
  "historically_unavailable",
] as const;

export type YoutubeReachStatus = (typeof YOUTUBE_REACH_STATUSES)[number];

export const YOUTUBE_REPORTING_HISTORY_DAYS = 30;

const DAY_IN_MS = 86_400_000;

export function normalizeClickRate(value: string | undefined): number | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed >= 0 && parsed <= 1 ? parsed * 100 : parsed;
}

export type YoutubeReachSnapshot = {
  impressions: number | null;
  impressionsClickThroughRate: number | null;
};

export type YoutubeReachAggregate = YoutubeReachSnapshot;

/**
 * Reach reports are daily files. Impressions therefore add up across the
 * stored days, while CTR must be recomputed as an impressions-weighted rate.
 * A row with a real zero remains data, and a CTR-only row is kept as a
 * fallback when there is no impression count to weight it against.
 */
export function aggregateYoutubeReach(snapshots: YoutubeReachSnapshot[]): YoutubeReachAggregate {
  let impressions = 0;
  let hasImpressions = false;
  let weightedImpressions = 0;
  let weightedClicks = 0;
  let latestClickRate: number | null = null;

  for (const snapshot of snapshots) {
    if (snapshot.impressions !== null) {
      impressions += snapshot.impressions;
      hasImpressions = true;
    }
    if (snapshot.impressionsClickThroughRate !== null) {
      latestClickRate = snapshot.impressionsClickThroughRate;
      if (snapshot.impressions !== null && snapshot.impressions > 0) {
        weightedImpressions += snapshot.impressions;
        weightedClicks += snapshot.impressions * snapshot.impressionsClickThroughRate / 100;
      }
    }
  }

  return {
    impressions: hasImpressions ? impressions : null,
    impressionsClickThroughRate: weightedImpressions > 0
      ? weightedClicks / weightedImpressions * 100
      : latestClickRate,
  };
}

export type YoutubeReachClassificationInput = {
  publishedAt: Date;
  impressions: number | null;
  impressionsClickThroughRate: number | null;
  jobCreatedAt: Date | null;
  latestReportEndAt: Date | null;
  reportsAvailable: boolean;
};

export type YoutubeReachClassification = {
  status: YoutubeReachStatus;
  needsInvestigation: boolean;
};

export function hasYoutubeReachMetric({
  impressions,
  impressionsClickThroughRate,
}: Pick<YoutubeReachClassificationInput, "impressions" | "impressionsClickThroughRate">): boolean {
  return impressions !== null || impressionsClickThroughRate !== null;
}

export function youtubeReachHistoryStart(jobCreatedAt: Date): Date {
  return new Date(jobCreatedAt.getTime() - YOUTUBE_REPORTING_HISTORY_DAYS * DAY_IN_MS);
}

/**
 * Classifies a video after a Reporting API poll.
 *
 * A missing row is only a pipeline issue once YouTube has generated a report
 * that covers the video's publication time. Before that point the video stays
 * pending. A video published before the job's initial history window is a
 * permanent API limitation and is never reported as a pipeline failure.
 */
export function classifyYoutubeReach(input: YoutubeReachClassificationInput): YoutubeReachClassification {
  if (hasYoutubeReachMetric(input)) {
    return { status: "available", needsInvestigation: false };
  }

  if (input.jobCreatedAt && input.publishedAt.getTime() < youtubeReachHistoryStart(input.jobCreatedAt).getTime()) {
    return { status: "historically_unavailable", needsInvestigation: false };
  }

  const reportCoversVideo =
    input.reportsAvailable &&
    input.latestReportEndAt !== null &&
    input.publishedAt.getTime() <= input.latestReportEndAt.getTime();

  return {
    status: "pending",
    needsInvestigation: reportCoversVideo,
  };
}
