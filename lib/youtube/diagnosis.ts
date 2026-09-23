import { hookRetention } from "./retention";
import type { YoutubeVideoInsightRow } from "./queries";

export type YoutubeDiagnosticAxis = "diffusion" | "click" | "retention" | "business";
export type YoutubeDiagnosticLevel = "strong" | "good" | "medium" | "weak" | "unavailable";

export type YoutubeDiagnostic = {
  axis: YoutubeDiagnosticAxis;
  level: YoutubeDiagnosticLevel;
  value: number | null;
  baseline: number | null;
};

export type YoutubeDiagnosticInput = {
  video: YoutubeVideoInsightRow;
  baselineViews?: number | null;
  baselineImpressions?: number | null;
  baselineClick?: number | null;
  baselineRetention?: number | null;
  baselineBookings?: number | null;
  baselineRevenueEur?: number | null;
  businessValue?: number | null;
  businessBaseline?: number | null;
  bookings: number | null;
  revenueEur: number | null;
};

const LOW_SAMPLE_VIEWS = 100;

function levelFromRatio(ratio: number | null): YoutubeDiagnosticLevel {
  if (ratio === null || !Number.isFinite(ratio)) return "unavailable";
  if (ratio >= 1.3) return "strong";
  if (ratio >= 1.05) return "good";
  if (ratio >= 0.85) return "medium";
  return "weak";
}

function compare(value: number | null, baseline: number | null): YoutubeDiagnosticLevel {
  if (value === null) return "unavailable";
  if (baseline === null || baseline <= 0) return value > 0 ? "medium" : "weak";
  return levelFromRatio(value / baseline);
}

export function diagnoseYoutubeVideo(input: YoutubeDiagnosticInput): YoutubeDiagnostic[] {
  const { video } = input;
  const lowSample = (video.views ?? 0) < LOW_SAMPLE_VIEWS;
  if (lowSample) {
    return (["diffusion", "click", "retention", "business"] as const).map((axis) => ({
      axis,
      level: "unavailable",
      value: null,
      baseline: null,
    }));
  }

  const hook = hookRetention(video);
  const retention = video.averageViewPercentage === null ? hook : video.averageViewPercentage;
  const diffusionValue = video.impressions ?? video.views;
  const diffusionBaseline = input.baselineImpressions ?? input.baselineViews ?? null;
  const businessValue = input.businessValue ?? input.revenueEur ?? input.bookings;
  const businessBaseline = input.businessBaseline ?? (input.revenueEur !== null ? input.baselineRevenueEur ?? null : input.baselineBookings ?? null);

  return [
    {
      axis: "diffusion",
      level: compare(diffusionValue, diffusionBaseline),
      value: diffusionValue,
      baseline: diffusionBaseline,
    },
    {
      axis: "click",
      level: compare(video.impressionsClickThroughRate, input.baselineClick ?? null),
      value: video.impressionsClickThroughRate,
      baseline: input.baselineClick ?? null,
    },
    {
      axis: "retention",
      level: compare(retention, input.baselineRetention ?? null),
      value: retention,
      baseline: input.baselineRetention ?? null,
    },
    {
      axis: "business",
      level: compare(businessValue, businessBaseline),
      value: businessValue,
      baseline: businessBaseline,
    },
  ];
}
