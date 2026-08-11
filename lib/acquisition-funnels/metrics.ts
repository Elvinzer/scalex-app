import type { AcquisitionFunnelCatalogEntry, AcquisitionFunnelKey } from "./types";
import { acquisitionFunnelHref } from "./routes";

export type AdaptiveFunnelStage = {
  id: string;
  label: string;
  unit: string;
  volume: number | null;
  currentRate: number | null;
  benchmarkRate: number | null;
  monthlyGain: number | null;
  metricKey: string | null;
  benchmarkKey: string | null;
  isReliable: boolean;
  noteKey: "volumeInsufficient" | "gainUnavailable" | null;
  sourceHref: string;
  source: "content" | "pipeline" | "calls" | "sales" | "manual";
};

export type AdaptiveFunnelVariant = {
  catalogKey: AcquisitionFunnelKey;
  catalogLabel: string;
  stages: AdaptiveFunnelStage[];
  bottleneckId: string | null;
  totalPotential: number | null;
  sales: number | null;
  revenue: number | null;
};

type BuildAdaptiveFunnelInput = {
  entry: AcquisitionFunnelCatalogEntry;
  stageVolumes: Record<string, number | null>;
  benchmarks: Record<string, number | null>;
  dealPrice: number | null;
  revenue: number | null;
  sourceHrefByMetric?: Record<string, string>;
};

function sourceFor(metricKey: string): AdaptiveFunnelStage["source"] {
  if (metricKey.includes("content") || metricKey === "audience") return "content";
  if (metricKey.includes("vsl")) return "manual";
  if (metricKey.includes("calls") || metricKey.includes("booking")) return "calls";
  if (metricKey.includes("sales")) return "sales";
  if (metricKey.includes("newsletter") || metricKey.includes("quiz") || metricKey.includes("webinar") || metricKey.includes("challenge") || metricKey.includes("community")) return "manual";
  return "pipeline";
}

function defaultHref(metricKey: string, funnelKey: AcquisitionFunnelKey): string {
  if (metricKey.includes("newsletter")) return "/acquisition/mail";
  if (metricKey.includes("content") || metricKey === "audience") return "/acquisition/contenu";
  if (metricKey.includes("vsl")) return acquisitionFunnelHref(funnelKey);
  if (metricKey.includes("booking_link")) return acquisitionFunnelHref(funnelKey);
  if (metricKey.includes("calls") || metricKey.includes("booking")) return "/acquisition/pipeline/funnel";
  if (metricKey.includes("sales")) return "/ventes/suivi";
  if (metricKey.includes("quiz") || metricKey.includes("webinar") || metricKey.includes("challenge") || metricKey.includes("community") || metricKey.includes("sales_page") || metricKey.includes("checkout")) return acquisitionFunnelHref(funnelKey);
  return "/datas";
}

export function buildAdaptiveFunnel({ entry, stageVolumes, benchmarks, dealPrice, revenue, sourceHrefByMetric = {} }: BuildAdaptiveFunnelInput): AdaptiveFunnelVariant {
  let previousVolume: number | null = null;
  const stages = entry.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((step) => {
      const volume = stageVolumes[step.inputMetricKey] ?? null;
      const currentRate = previousVolume !== null && previousVolume > 0 && volume !== null ? volume / previousVolume : null;
      const benchmarkRate = step.benchmarkKey === null ? null : benchmarks[`${entry.funnelKey}:${step.benchmarkKey}`] ?? null;
      const denominator = previousVolume;
      const isReliable = currentRate !== null && denominator !== null && denominator >= 30;
      const monthlyGain = isReliable && currentRate !== null && benchmarkRate !== null && dealPrice !== null && currentRate < benchmarkRate
        ? Math.round((benchmarkRate - currentRate) * (denominator ?? 0) * dealPrice)
        : benchmarkRate !== null && currentRate !== null && currentRate >= benchmarkRate
          ? 0
          : null;
      const stage = {
        id: `${entry.funnelKey}:${step.metricKey}`,
        label: step.label,
        unit: step.unit,
        volume,
        currentRate,
        benchmarkRate,
        monthlyGain,
        metricKey: step.metricKey,
        benchmarkKey: step.benchmarkKey,
        isReliable,
        noteKey: currentRate !== null && !isReliable ? "volumeInsufficient" : monthlyGain === null && benchmarkRate !== null ? "gainUnavailable" : null,
        sourceHref: sourceHrefByMetric[step.inputMetricKey] ?? defaultHref(step.inputMetricKey, entry.funnelKey),
        source: sourceFor(step.inputMetricKey),
      } satisfies AdaptiveFunnelStage;
      previousVolume = volume;
      return stage;
    });
  const topStage = stages.reduce<AdaptiveFunnelStage | null>((top, stage) => {
    if (stage.monthlyGain === null || stage.monthlyGain <= 0) return top;
    return !top || stage.monthlyGain > (top.monthlyGain ?? 0) ? stage : top;
  }, null);
  const gains = stages.map((stage) => stage.monthlyGain).filter((gain): gain is number => gain !== null);
  return {
    catalogKey: entry.funnelKey,
    catalogLabel: entry.label,
    stages,
    bottleneckId: topStage?.id ?? null,
    totalPotential: gains.length > 0 ? gains.reduce((sum, gain) => sum + gain, 0) : null,
    sales: stageVolumes.sales_closed ?? null,
    revenue,
  };
}
