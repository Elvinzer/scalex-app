import type { ClosingTotals } from "@/lib/closing/metrics";
import type { BusinessProfileData } from "@/lib/business/types";
import type { FunnelTotals } from "@/lib/setting/funnel";

import { METRIC_KEYS, type MetricKey } from "./benchmarks";
import {
  buildRates,
  categoryFor,
  computeDiagnosticPoints,
  labelFor,
  resolveDealPrice,
  simulateSales,
  type DiagnosticPoint,
} from "./cascade";

export type OnboardingGoulotResult =
  | { kind: "point"; point: DiagnosticPoint }
  | { kind: "no_gap" } // real data, but every measured rate already meets its benchmark
  | { kind: "no_data" }; // nothing measurable at all — every rate is null

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// Onboarding screen 3's "aha moment" needs a number even from a single
// approximate month, which is almost always under the main engine's
// MIN_VOLUME=30 gate (lib/diagnostic/cascade.ts, untouched/still strict
// everywhere else). This first tries the strict engine as-is; only if it
// finds nothing does it fall back to picking the metric with the largest
// relative gap vs. benchmark, ignoring the volume gate — same €/month math
// (simulateSales/resolveDealPrice), just without the reliability guard.
export function computeOnboardingGoulot({
  settingTotals,
  closingTotals,
  benchmarks,
  businessProfile,
  cashContractedTotal,
}: {
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  benchmarks: Record<MetricKey, number>;
  businessProfile: BusinessProfileData;
  cashContractedTotal: number;
}): OnboardingGoulotResult {
  const strictPoints = computeDiagnosticPoints({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal });
  if (strictPoints.length > 0) {
    return { kind: "point", point: strictPoints[0] };
  }

  const rates = buildRates(settingTotals, closingTotals);
  const measuredKeys = METRIC_KEYS.filter((key) => rates[key] !== null);
  if (measuredKeys.length === 0) {
    return { kind: "no_data" };
  }

  let best: { key: MetricKey; gap: number } | null = null;
  for (const key of measuredKeys) {
    const current = rates[key] as number;
    const benchmark = benchmarks[key];
    if (current >= benchmark) continue;
    const gap = (benchmark - current) / benchmark;
    if (!best || gap > best.gap) best = { key, gap };
  }
  if (!best) {
    return { kind: "no_gap" };
  }

  const { key } = best;
  const current = rates[key] as number;
  const benchmark = benchmarks[key];
  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const messagesSent = settingTotals.firstMessagesSent;
  const realSales = simulateSales(messagesSent, rates);
  const simulatedSales = simulateSales(messagesSent, rates, { [key]: benchmark });
  const extraClients = realSales !== null && simulatedSales !== null ? round1(simulatedSales - realSales) : 0;
  const monthlyGain = dealPrice.price !== null ? Math.round(extraClients * dealPrice.price) : null;
  const mainOffer = businessProfile.sales.offers.find((offer) => offer.isMain);
  const yearlyGain = monthlyGain !== null && mainOffer?.recurrence === "mensuel" ? monthlyGain * 12 : null;
  const currentPct = Math.round(current * 100);
  const benchmarkPct = Math.round(benchmark * 100);

  const point: DiagnosticPoint = {
    key,
    category: categoryFor(key),
    label: labelFor(key),
    status: best.gap < 0.2 ? "caution" : "critical",
    currentRatePercent: currentPct,
    benchmarkRatePercent: benchmarkPct,
    extraClients,
    monthlyGain,
    yearlyGain,
    isPriceFallback: dealPrice.isFallback,
    explanation: `${labelFor(key)} est à ${currentPct}% contre ${benchmarkPct}% en moyenne pour ta niche (première estimation sur tes tout premiers chiffres, à affiner avec plus de données).`,
    tooltip: "Calculé sans le seuil de fiabilité habituel (volume encore trop faible pour être garanti). Une première estimation avec tes tout premiers chiffres.",
  };

  return { kind: "point", point };
}
