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

const MIN_RELIABLE_DENOMINATOR = 30;

function normaliseVolume(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function normaliseRate(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

/**
 * Projects the final stage without adding traffic that does not exist.
 *
 * When a stage is not being simulated, its observed rate is used. A missing
 * or impossible rate stops the estimate instead of letting a bad denominator
 * create money out of thin air. The stage being improved still has to pass
 * the reliability threshold. In the all-benchmarks projection, benchmark
 * rates replace observed rates wherever they exist, which gives the
 * sequential potential of the whole funnel.
 */
function projectFinalVolume(
  stages: AdaptiveFunnelStage[],
  overrideIndex: number | null,
  useBenchmarks: boolean
): number | null {
  const firstStageVolume = stages[0]?.volume ?? null;
  if (firstStageVolume === null) return null;

  let projectedVolume = firstStageVolume;
  for (let index = 1; index < stages.length; index += 1) {
    const stage = stages[index];
    const shouldUseBenchmark = stage.benchmarkRate !== null && (useBenchmarks || overrideIndex === index);

    if (shouldUseBenchmark) {
      projectedVolume *= stage.benchmarkRate ?? 0;
      continue;
    }

    if (stage.currentRate === null) return null;
    projectedVolume *= stage.currentRate;
  }

  return projectedVolume;
}

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
  if (metricKey.includes("calls") || metricKey.includes("booking")) return "/ventes/pipeline/funnel";
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
      const volume = normaliseVolume(stageVolumes[step.inputMetricKey]);
      const rawCurrentRate = previousVolume !== null && previousVolume > 0 && volume !== null ? volume / previousVolume : null;
      const currentRate = normaliseRate(rawCurrentRate);
      const benchmarkRate = step.benchmarkKey === null
        ? null
        : normaliseRate(benchmarks[`${entry.funnelKey}:${step.benchmarkKey}`]);
      const denominator = previousVolume;
      const isReliable = currentRate !== null && denominator !== null && denominator >= MIN_RELIABLE_DENOMINATOR;
      const stage = {
        id: `${entry.funnelKey}:${step.metricKey}`,
        label: step.label,
        unit: step.unit,
        volume,
        currentRate,
        benchmarkRate,
        monthlyGain: null,
        metricKey: step.metricKey,
        benchmarkKey: step.benchmarkKey,
        isReliable,
        noteKey: null,
        sourceHref: sourceHrefByMetric[step.inputMetricKey] ?? defaultHref(step.inputMetricKey, entry.funnelKey),
        source: sourceFor(step.inputMetricKey),
      } satisfies AdaptiveFunnelStage;
      previousVolume = volume;
      return stage;
    });

  const effectiveDealPrice = typeof dealPrice === "number" && Number.isFinite(dealPrice) && dealPrice > 0 ? dealPrice : null;
  const currentFinalVolume = stages.at(-1)?.volume ?? null;
  const projectedCurrentFinal = projectFinalVolume(stages, null, false);
  const baselineFinalVolume = projectedCurrentFinal ?? currentFinalVolume;
  const completeFunnel = stages.every((stage, index) => stage.volume !== null && (index === 0 || stage.currentRate !== null));

  // Each stage gain answers: “what happens to final sales if only this stage
  // reaches its benchmark and the rest of the funnel keeps its observed
  // conversion rates?” This prevents adding independent theoretical gains
  // that count the same future sale several times.
  const estimatedStages = stages.map((stage, index) => {
    let monthlyGain: number | null = null;

    if (stage.benchmarkRate !== null && stage.currentRate !== null && stage.isReliable) {
      if (stage.currentRate >= stage.benchmarkRate) {
        monthlyGain = 0;
      } else if (effectiveDealPrice !== null && baselineFinalVolume !== null) {
        const projectedFinal = projectFinalVolume(stages, index, false);
        monthlyGain = projectedFinal === null
          ? null
          : Math.round(Math.max(0, projectedFinal - baselineFinalVolume) * effectiveDealPrice);
      }
    }

    return {
      ...stage,
      monthlyGain,
      noteKey: stage.currentRate !== null && !stage.isReliable
        ? "volumeInsufficient"
        : monthlyGain === null && stage.benchmarkRate !== null
          ? "gainUnavailable"
          : null,
    } satisfies AdaptiveFunnelStage;
  });

  // The total is one sequential scenario: every measurable stage reaches its
  // benchmark once, then the resulting final sales are compared with the
  // current final sales. It is deliberately not the sum of stage gains.
  const benchmarkFinalVolume = completeFunnel ? projectFinalVolume(estimatedStages, null, true) : null;
  const totalPotential = effectiveDealPrice !== null && currentFinalVolume !== null && benchmarkFinalVolume !== null
    ? Math.round(Math.max(0, benchmarkFinalVolume - currentFinalVolume) * effectiveDealPrice)
    : null;

  const topStage = estimatedStages.reduce<AdaptiveFunnelStage | null>((top, stage) => {
    if (stage.monthlyGain === null || stage.monthlyGain <= 0) return top;
    return !top || stage.monthlyGain > (top.monthlyGain ?? 0) ? stage : top;
  }, null);

  return {
    catalogKey: entry.funnelKey,
    catalogLabel: entry.label,
    stages: estimatedStages,
    bottleneckId: topStage?.id ?? null,
    totalPotential,
    sales: currentFinalVolume,
    revenue,
  };
}
