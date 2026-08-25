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
import { CAUTION_SCORE_MAX, computeMetricHealthCards, type MetricHealthCard } from "./cascade";
import type { MonthWindow } from "./completed-months";
import { METRIC_KEYS, type MetricKey } from "./metric-keys";

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
  potentialScore: number | null; // score if every covered pillar's open gaps were closed — same null rule as score
  pillars: ScaleScorePillar[];
};

// Explains WHY score is null, for the UI to name the actual blocker instead
// of a generic "give me your numbers". Missing months take priority over
// pillar coverage — an uncovered pillar is often just a symptom of an empty
// month inside the window, and filling months is the more actionable ask.
export type ScaleScoreGap =
  | { type: "missing_months"; months: MonthWindow[] }
  | { type: "low_coverage"; pillarLabels: string[] };

export type ScaleScoreGapSource = {
  key: "month" | "acquisition" | "sales" | "delivery";
  href: string;
  year?: number;
  month?: number;
};

export type ScaleScoreTarget = ScaleScoreGapSource["key"];

export function scaleScoreGapSources(gap: ScaleScoreGap | null): ScaleScoreGapSource[] {
  if (!gap) return [];
  if (gap.type === "missing_months") {
    return gap.months.map((month) => ({
      key: "month" as const,
      href: `/datas?year=${month.year}&month=${month.month}&scaleScore=month`,
      year: month.year,
      month: month.month,
    }));
  }

  return gap.pillarLabels.flatMap((label): ScaleScoreGapSource[] => {
    const normalized = label.toLowerCase();
    if (normalized.includes("acquisition")) return [{ key: "acquisition", href: "/datas?scaleScore=acquisition" }];
    if (normalized.includes("vente")) return [{ key: "sales", href: "/ventes/appels?scaleScore=sales" }];
    if (normalized.includes("délivr") || normalized.includes("delivr")) return [{ key: "delivery", href: "/business?scaleScore=delivery#livraison" }];
    return [];
  });
}

// Only meaningful when score === null. `covered === true` always implies a
// non-null pillar score (see computeScaleScore below), so score === null
// with no empty months guarantees at least 2 of the 3 pillars are uncovered
// — MIN_COVERED_PILLARS is 2, so 2 covered pillars alone would already
// produce a score.
export function describeScaleScoreGap(emptyMonths: MonthWindow[], pillars: ScaleScorePillar[]): ScaleScoreGap | null {
  if (emptyMonths.length > 0) {
    return { type: "missing_months", months: emptyMonths };
  }
  const pillarLabels = pillars.filter((p) => !p.covered).map((p) => p.label);
  return pillarLabels.length > 0 ? { type: "low_coverage", pillarLabels } : null;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

// A card already at/above benchmark ("ok") has nothing left to "correct" —
// its potential is its current score. A card below benchmark projects to
// CAUTION_SCORE_MAX, the score it would get at exactly ratio == 1 (current
// == benchmark) — "if you just hit the standard".
function potentialCardScore(card: MetricHealthCard): number {
  return card.status === "ok" ? card.score : CAUTION_SCORE_MAX;
}

export function computeScaleScore({
  settingTotals,
  closingTotals,
  benchmarks,
  businessProfile,
  cashContractedTotal,
  activeMetricKeys,
}: {
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  benchmarks: Record<MetricKey, number>;
  businessProfile: BusinessProfileData;
  cashContractedTotal: number;
  activeMetricKeys?: MetricKey[];
}): ScaleScoreResult {
  const cards = computeMetricHealthCards({
    settingTotals,
    closingTotals,
    benchmarks,
    businessProfile,
    cashContractedTotal,
    activeMetricKeys,
  });

  const settingCards = cards.filter((c) => c.category === "Setting");
  const closingCards = cards.filter((c) => c.category === "Closing");
  const deliveryCompletion = computeSectionCompletion("delivery", businessProfile.delivery).percent;

  const activeKeys = activeMetricKeys ?? METRIC_KEYS;
  const settingMetricCount = activeKeys.filter((key) => key === "responseRate" || key === "proposalRate" || key === "bookingRate").length || SETTING_METRIC_COUNT;
  const closingMetricCount = activeKeys.filter((key) => key === "showUpRate" || key === "closingRate").length || CLOSING_METRIC_COUNT;
  const acquisitionCoverage = settingCards.length / settingMetricCount;
  const venteCoverage = closingCards.length / closingMetricCount;
  const delivrabiliteCoverage = deliveryCompletion / 100;

  const pillars: ScaleScorePillar[] = [
    {
      key: "acquisition",
      label: "Acquisition",
      covered: acquisitionCoverage >= COVERAGE_THRESHOLD,
      score: acquisitionCoverage >= COVERAGE_THRESHOLD ? average(settingCards.map((c) => c.score)) : null,
    },
    {
      key: "vente",
      label: "Vente",
      covered: venteCoverage >= COVERAGE_THRESHOLD,
      score: venteCoverage >= COVERAGE_THRESHOLD ? average(closingCards.map((c) => c.score)) : null,
    },
    {
      key: "delivrabilite",
      label: "Délivrabilité",
      covered: delivrabiliteCoverage >= COVERAGE_THRESHOLD,
      score: delivrabiliteCoverage >= COVERAGE_THRESHOLD ? deliveryCompletion : null,
    },
  ];

  // Potential pillars mirror the same coverage/null rules as pillars above —
  // a pillar with no baseline score gets no projected potential either.
  const potentialPillarScores: (number | null)[] = [
    pillars[0].covered ? average(settingCards.map(potentialCardScore)) : null,
    pillars[1].covered ? average(closingCards.map(potentialCardScore)) : null,
    // Délivrabilité's "correction" is finishing the profile, i.e. 100.
    pillars[2].covered ? 100 : null,
  ];

  const coveredScores = pillars.filter((p) => p.covered && p.score !== null).map((p) => p.score as number);
  const score = coveredScores.length >= MIN_COVERED_PILLARS ? average(coveredScores) : null;

  const coveredPotentialScores = pillars
    .map((p, i) => (p.covered && p.score !== null ? potentialPillarScores[i] : null))
    .filter((v): v is number => v !== null);
  const potentialScore = score !== null && coveredPotentialScores.length >= MIN_COVERED_PILLARS
    ? Math.max(average(coveredPotentialScores) as number, score)
    : null;

  return { score, potentialScore, pillars };
}
