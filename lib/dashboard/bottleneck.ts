import type { BusinessProfileData } from "@/lib/business/types";
import type { ClosingTotals } from "@/lib/closing/metrics";
import { computeContentGain, type ContentGain } from "@/lib/diagnostic/content-gain";
import {
  computeContentMetricSummaries,
  type ContentMetricKey,
  type ContentTotals,
} from "@/lib/diagnostic/content-metrics";
import {
  buildRates,
  resolveDealPrice,
  type DiagnosticPoint,
} from "@/lib/diagnostic/cascade";
import type { MetricKey } from "@/lib/diagnostic/metric-keys";
import type { FunnelTotals } from "@/lib/setting/funnel";
import type { ContentRetentionSummary } from "@/lib/diagnostic/content-retention";
import type { PipelinePeriodTotals } from "@/lib/diagnostic/aggregate";

export const BOTTLENECK_STAGE_IDS = [
  "views",
  "clicks",
  "retention",
  "leads",
  "bookedCalls",
  "attendedCalls",
  "salesClosed",
] as const;

// Runtime catalogue stages can be added without a TypeScript deployment.
// Legacy ids remain in BOTTLENECK_STAGE_IDS for tests and fallback labels.
export type BottleneckStageId = string;

export type BottleneckStage = {
  id: string;
  volume: number | null;
  currentRate: number | null;
  benchmarkRate: number | null;
  monthlyGain: number | null;
  metricKey: string | null;
  isReliable: boolean;
  noteKey: "retentionUnavailable" | "volumeInsufficient" | "gainUnavailable" | null;
  source?: "content" | "pipeline" | "calls" | "sales" | "manual";
  label?: string;
  unit?: string;
  sourceHref?: string;
};

export type BottleneckFunnelVariant = {
  catalogKey?: string;
  catalogLabel?: string;
  stages: BottleneckStage[];
  bottleneckId: string | null;
  totalPotential: number | null;
  sales: number | null;
  revenue: number | null;
};

export type BottleneckFunnelData = BottleneckFunnelVariant & {
  variants?: BottleneckFunnelVariant[];
  activeFunnelKey?: string;
};

type GainResolution = {
  monthlyGain: number | null;
  isReliable: boolean;
  noteKey: BottleneckStage["noteKey"];
};

function resolveCascadeGain(
  currentRate: number | null,
  benchmarkRate: number,
  point: DiagnosticPoint | undefined
): GainResolution {
  if (currentRate === null || benchmarkRate <= 0) {
    return { monthlyGain: null, isReliable: false, noteKey: null };
  }

  if (currentRate >= benchmarkRate) {
    return { monthlyGain: 0, isReliable: true, noteKey: null };
  }

  if (!point) {
    return { monthlyGain: null, isReliable: false, noteKey: "volumeInsufficient" };
  }

  return {
    monthlyGain: point.monthlyGain,
    isReliable: true,
    noteKey: point.monthlyGain === null ? "gainUnavailable" : null,
  };
}

function resolveContentGain(
  key: ContentMetricKey,
  summary: ReturnType<typeof computeContentMetricSummaries>[number] | undefined,
  totals: ContentTotals,
  contentBenchmarks: Record<ContentMetricKey, number>,
  funnelRates: Record<MetricKey, number | null>,
  funnelBenchmarks: Record<MetricKey, number>,
  dealPrice: ReturnType<typeof resolveDealPrice>,
  locale: string
): GainResolution {
  if (!summary || summary.sample.denominator <= 0 || contentBenchmarks[key] <= 0) {
    return { monthlyGain: null, isReliable: false, noteKey: null };
  }

  if (summary.status === "unmeasured") {
    return { monthlyGain: null, isReliable: false, noteKey: "volumeInsufficient" };
  }

  const currentRate = summary.sample.numerator / summary.sample.denominator;
  const benchmarkRate = contentBenchmarks[key];
  if (currentRate >= benchmarkRate) {
    return { monthlyGain: 0, isReliable: true, noteKey: null };
  }

  const gain: ContentGain = computeContentGain({
    metricKey: key,
    totals,
    contentBenchmarks,
    funnelRates,
    funnelBenchmarks,
    dealPrice,
    locale,
  });

  return {
    monthlyGain: gain.monthlyGain,
    isReliable: true,
    noteKey: gain.monthlyGain === null ? "gainUnavailable" : null,
  };
}

function contentStage(
  id: "clicks" | "leads",
  key: "content_click_rate" | "content_lead_rate",
  summaries: ReturnType<typeof computeContentMetricSummaries>,
  totals: ContentTotals,
  contentBenchmarks: Record<ContentMetricKey, number>,
  funnelRates: Record<MetricKey, number | null>,
  funnelBenchmarks: Record<MetricKey, number>,
  dealPrice: ReturnType<typeof resolveDealPrice>,
  locale: string
): BottleneckStage {
  const summary = summaries.find((item) => item.key === key);
  const sample = totals.samples[key];
  const currentRate = !summary || summary.sample.denominator <= 0
    ? null
    : summary.sample.numerator / summary.sample.denominator;
  const gain = resolveContentGain(
    key,
    summary,
    totals,
    contentBenchmarks,
    funnelRates,
    funnelBenchmarks,
    dealPrice,
    locale
  );

  return {
    id,
    volume: sample.posts > 0 ? sample.numerator : null,
    currentRate,
    benchmarkRate: contentBenchmarks[key] > 0 ? contentBenchmarks[key] : null,
    monthlyGain: gain.monthlyGain,
    metricKey: id === "clicks" ? "content_click_rate" : "content_lead_rate",
    isReliable: gain.isReliable,
    noteKey: gain.noteKey,
    source: "content",
  };
}

export function buildBottleneckFunnel({
  contentTotals,
  contentPostsCount,
  contentBenchmarks,
  settingTotals,
  closingTotals,
  funnelBenchmarks,
  businessProfile,
  cashContractedTotal,
  diagnosticPoints,
  hasSettingData,
  hasClosingData,
  hasRevenueData,
  retention,
  pipelineTotals,
  pipelineBenchmarkRate,
  locale,
}: {
  contentTotals: ContentTotals;
  contentPostsCount: number;
  contentBenchmarks: Record<ContentMetricKey, number>;
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  funnelBenchmarks: Record<MetricKey, number>;
  businessProfile: BusinessProfileData;
  cashContractedTotal: number;
  diagnosticPoints: DiagnosticPoint[];
  hasSettingData: boolean;
  hasClosingData: boolean;
  hasRevenueData: boolean;
  retention?: ContentRetentionSummary | null;
  pipelineTotals?: PipelinePeriodTotals;
  pipelineBenchmarkRate?: number | null;
  locale: string;
}): BottleneckFunnelData {
  const summaries = computeContentMetricSummaries({ totals: contentTotals, benchmarks: contentBenchmarks });
  const funnelRates = buildRates(settingTotals, closingTotals);
  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const pointsByKey = new Map<MetricKey, DiagnosticPoint>(diagnosticPoints.map((point) => [point.key, point]));

  const cascadeStage = (
    id: "bookedCalls" | "attendedCalls" | "salesClosed",
    volume: number,
    metricKey: "bookingRate" | "showUpRate" | "closingRate"
  ): BottleneckStage => {
    const currentRate = funnelRates[metricKey];
    const benchmarkRate = funnelBenchmarks[metricKey] > 0 ? funnelBenchmarks[metricKey] : null;
    const gain = resolveCascadeGain(currentRate, benchmarkRate ?? 0, pointsByKey.get(metricKey));

    return {
      id,
      volume: volume >= 0 ? volume : null,
      currentRate,
      benchmarkRate,
      monthlyGain: gain.monthlyGain,
      metricKey,
      isReliable: gain.isReliable,
      noteKey: gain.noteKey,
      source: id === "salesClosed" ? "sales" : "calls",
    };
  };

  const stages: BottleneckStage[] = [
    {
      id: "views",
      volume: contentPostsCount > 0 ? contentTotals.views : null,
      currentRate: null,
      benchmarkRate: null,
      monthlyGain: null,
      metricKey: null,
      isReliable: contentPostsCount > 0,
      noteKey: null,
      source: "content",
    },
    contentStage(
      "clicks",
      "content_click_rate",
      summaries,
      contentTotals,
      contentBenchmarks,
      funnelRates,
      funnelBenchmarks,
      dealPrice,
      locale
    ),
    retention
      ? {
          id: "retention" as const,
          volume: retention.views > 0 ? retention.views : null,
          currentRate: retention.currentRate,
          benchmarkRate: retention.currentRate === null ? null : retention.benchmarkRate,
          monthlyGain: null,
          metricKey: null,
          isReliable: retention.currentRate !== null,
          noteKey: retention.currentRate === null ? "retentionUnavailable" : "gainUnavailable",
          source: "content" as const,
        }
      : {
          id: "retention" as const,
          volume: null,
          currentRate: null,
          benchmarkRate: null,
          monthlyGain: null,
          metricKey: null,
          isReliable: false,
          noteKey: "retentionUnavailable" as const,
          source: "content" as const,
        },
    pipelineTotals && pipelineTotals.worked > 0
      ? (() => {
          const benchmarkRate = pipelineBenchmarkRate && pipelineBenchmarkRate > 0 ? pipelineBenchmarkRate : null;
          const currentRate = pipelineTotals.closed / pipelineTotals.worked;
          const monthlyGain = benchmarkRate !== null && currentRate < benchmarkRate && dealPrice.price !== null
            ? Math.round((benchmarkRate - currentRate) * pipelineTotals.worked * dealPrice.price)
            : benchmarkRate !== null && currentRate < benchmarkRate
              ? null
              : 0;
          return {
            id: "leads" as const,
            volume: pipelineTotals.worked,
            currentRate,
            benchmarkRate,
            monthlyGain,
            metricKey: "pipeline_closing_rate",
            isReliable: pipelineTotals.worked >= 30,
            noteKey: benchmarkRate === null || monthlyGain === null ? "gainUnavailable" as const : null,
            source: "pipeline" as const,
          };
        })()
      : contentStage(
          "leads",
          "content_lead_rate",
          summaries,
          contentTotals,
          contentBenchmarks,
          funnelRates,
          funnelBenchmarks,
          dealPrice,
          locale
        ),
    cascadeStage("bookedCalls", hasSettingData ? settingTotals.callsBooked : -1, "bookingRate"),
    cascadeStage("attendedCalls", hasClosingData ? closingTotals.callsAttended : -1, "showUpRate"),
    cascadeStage("salesClosed", hasClosingData ? closingTotals.salesClosed : -1, "closingRate"),
  ];

  const knownGains = stages
    .map((stage) => stage.monthlyGain)
    .filter((gain): gain is number => gain !== null);
  const topStage = stages.reduce<BottleneckStage | null>((top, stage) => {
    if (stage.monthlyGain === null || stage.monthlyGain <= 0) return top;
    if (!top || stage.monthlyGain > (top.monthlyGain ?? 0)) return stage;
    return top;
  }, null);

  return {
    stages,
    bottleneckId: topStage?.id ?? null,
    totalPotential: knownGains.length > 0 ? knownGains.reduce((sum, gain) => sum + gain, 0) : null,
    sales: hasClosingData ? closingTotals.salesClosed : null,
    revenue: hasRevenueData ? cashContractedTotal : null,
  };
}
