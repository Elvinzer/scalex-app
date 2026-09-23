import type { VideoPerformanceComparison } from "./insights-comparison";

export type YoutubeTableSignal = "strong" | "good" | "neutral" | "weak" | "unavailable";

export type YoutubeTableDiagnosticKey =
  | "veryGoodPerformance"
  | "goodClickAverageRetention"
  | "lowClick"
  | "goodThumbnailWeakHook"
  | "goodVideoLowDistribution"
  | "strongBusinessConversion"
  | "strongAudienceLowConversion"
  | "weakRetention"
  | "needsData"
  | "working";

export type YoutubeTableDiagnosticTone = "healthy" | "caution" | "critical" | "unknown";

export type YoutubeTableDiagnostic = {
  key: YoutubeTableDiagnosticKey;
  tone: YoutubeTableDiagnosticTone;
};

export function tableSignalFromComparison(
  value: number | null,
  comparison: VideoPerformanceComparison | null,
): YoutubeTableSignal {
  if (value === null || !Number.isFinite(value)) return "unavailable";
  if (comparison === null) return "neutral";
  if (comparison.ratio >= 1.5) return "strong";
  if (comparison.ratio >= 1.15) return "good";
  if (comparison.ratio <= 0.85) return "weak";
  return "neutral";
}

export function summarizeYoutubeTableRow(input: {
  performance: YoutubeTableSignal;
  diffusion: YoutubeTableSignal;
  click: YoutubeTableSignal;
  hook: YoutubeTableSignal;
  retention: YoutubeTableSignal;
  growth: YoutubeTableSignal;
  business: YoutubeTableSignal;
}): YoutubeTableDiagnostic {
  const { performance, diffusion, click, hook, retention, growth, business } = input;

  if (business === "strong") return { key: "strongBusinessConversion", tone: "healthy" };
  if ((performance === "strong" || performance === "good") && growth === "weak") {
    return { key: "strongAudienceLowConversion", tone: "caution" };
  }
  if ((diffusion === "strong" || diffusion === "good") && click === "weak") {
    return { key: "lowClick", tone: "critical" };
  }
  if ((click === "strong" || click === "good") && hook === "weak") {
    return { key: "goodThumbnailWeakHook", tone: "critical" };
  }
  if (diffusion === "weak" && (retention === "strong" || retention === "good")) {
    return { key: "goodVideoLowDistribution", tone: "caution" };
  }
  if ((click === "strong" || click === "good") && (retention === "neutral" || retention === "weak")) {
    return { key: "goodClickAverageRetention", tone: "caution" };
  }
  if (retention === "weak") return { key: "weakRetention", tone: "critical" };
  if (
    performance === "unavailable" &&
    diffusion === "unavailable" &&
    click === "unavailable" &&
    retention === "unavailable" &&
    growth === "unavailable" &&
    business === "unavailable"
  ) {
    return { key: "needsData", tone: "unknown" };
  }
  return { key: "working", tone: performance === "strong" ? "healthy" : "caution" };
}
