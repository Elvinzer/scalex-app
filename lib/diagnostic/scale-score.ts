// Overall /100 "Scale Score" — an aggregation layer, not a new scoring
// engine. Acquisition/Vente reuse computeMetricHealthCards' per-metric
// scores as-is (grouped by category); Délivrabilité has no real measured
// metric today (no churn/retention tracking exists), so it's proxied by
// how complete the Delivery section of the business profile is — an
// honest stand-in for "have you even defined your delivery process",
// documented here so it isn't mistaken for a real health metric later.
import type { ClosingTotals } from "@/lib/closing/metrics";
import type { FunnelTotals } from "@/lib/setting/funnel";
import type { BusinessProfileData } from "@/lib/business/types";
import { computeSectionCompletion } from "@/lib/business/completion";
import { computeMetricHealthCards } from "./cascade";
import type { MetricKey } from "./metric-keys";

const COVERAGE_THRESHOLD = 0.4; // matches the brief's "couverture < 40 %" -> "À compléter"
const SETTING_METRIC_COUNT = 3; // responseRate, proposalRate, bookingRate
const CLOSING_METRIC_COUNT = 2; // showUpRate, closingRate
const MIN_COVERED_PILLARS = 2; // brief's "< 2 piliers notés" -> no overall score

export type ScaleScorePillarKey = "acquisition" | "vente" | "delivrabilite";

export type ScaleScorePillar = {
  key: ScaleScorePillarKey;
  label: string;
  score: number | null; // null when not covered
  covered: boolean;
};

export type ScaleScoreResult = {
  score: number | null; // null when fewer than MIN_COVERED_PILLARS pillars are covered
  pillars: ScaleScorePillar[];
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

export function computeScaleScore({
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
}): ScaleScoreResult {
  const cards = computeMetricHealthCards({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal });

  const settingScores = cards.filter((c) => c.category === "Setting").map((c) => c.score);
  const closingScores = cards.filter((c) => c.category === "Closing").map((c) => c.score);
  const deliveryCompletion = computeSectionCompletion("delivery", businessProfile.delivery).percent;

  const acquisitionCoverage = settingScores.length / SETTING_METRIC_COUNT;
  const venteCoverage = closingScores.length / CLOSING_METRIC_COUNT;
  const delivrabiliteCoverage = deliveryCompletion / 100;

  const pillars: ScaleScorePillar[] = [
    {
      key: "acquisition",
      label: "Acquisition",
      covered: acquisitionCoverage >= COVERAGE_THRESHOLD,
      score: acquisitionCoverage >= COVERAGE_THRESHOLD ? average(settingScores) : null,
    },
    {
      key: "vente",
      label: "Vente",
      covered: venteCoverage >= COVERAGE_THRESHOLD,
      score: venteCoverage >= COVERAGE_THRESHOLD ? average(closingScores) : null,
    },
    {
      key: "delivrabilite",
      label: "Délivrabilité",
      covered: delivrabiliteCoverage >= COVERAGE_THRESHOLD,
      score: delivrabiliteCoverage >= COVERAGE_THRESHOLD ? deliveryCompletion : null,
    },
  ];

  const coveredScores = pillars.filter((p) => p.covered && p.score !== null).map((p) => p.score as number);
  const score = coveredScores.length >= MIN_COVERED_PILLARS ? average(coveredScores) : null;

  return { score, pillars };
}
