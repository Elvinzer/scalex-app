import type { BusinessProfileData } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";

import type { DiagnosticPoint } from "./cascade";
import { computeHealthScore } from "./cascade";
import type { MetricKey } from "./metric-keys";
import type { PriorityRule, PriorityRuleCondition } from "./priority-rules";

type Effort = "faible" | "moyen" | "eleve";

// Metric candidates have no `effort` field of their own (unlike lever
// opportunities, which carry it from levers_catalog) — this is a product
// calibration, not derived from any spec: how much work each cascade stage
// typically takes to move (a message/script tweak vs. a real sales-process
// rework), used only for the faisabilité factor below.
const METRIC_EFFORT: Record<MetricKey, Effort> = {
  responseRate: "faible",
  proposalRate: "faible",
  bookingRate: "moyen",
  showUpRate: "faible",
  closingRate: "eleve",
};

const EFFORT_FAISABILITE_FACTOR: Record<Effort, number> = { faible: 1, moyen: 0.7, eleve: 0.45 };
const EFFORT_LABEL: Record<Effort, string> = { faible: "faible", moyen: "moyen", eleve: "élevé" };

// A recommendation must clear this score to be shown at all — below it, the
// full existing €-sorted list (unchanged) stands alone rather than padding
// the hero block with a low-confidence pick.
const PRIORITY_THRESHOLD = 35;
const MAX_RECOMMENDATIONS = 3;

// Normalized shape a caller must map its lever candidates into before
// calling computePriorityScores — decouples this module from
// lib/levers/opportunities.ts's two distinct shapes (LeverOpportunity for
// absent levers, LeverWatchItem for active-but-underperforming ones) so
// each page can choose which pool of levers it wants scored: Diagnostic's
// hero still recommends absent levers ("commence par…", starting something
// new is in scope there); Dashboard's "à corriger en priorité" only wants
// levers already in place (see isActive below), never a "go set this up"
// suggestion.
export type LeverCandidateInput = {
  leverKey: string;
  label: string;
  category: string;
  impactAmountEur: number | null;
  effort: Effort;
  healthScore: number;
  // true = already active, just underperforming (an entry from toWatch);
  // false = not yet implemented at all (an entry from toImplement). Only
  // changes the "why" wording (already-in-place vs not-yet-in-place
  // phrasing) — the scoring formula itself is identical either way.
  isActive: boolean;
};

export type PriorityCandidate = {
  type: "metric" | "lever";
  key: string; // MetricKey for "metric", leverKey for "lever"
  label: string;
  category: string;
  monthlyGainEur: number; // never null here — null-impact candidates are excluded before this type exists
  effort: Effort;
  extraClientsPerMonth: number | null; // metric only; levers have no comparable field
  healthScore: number; // getHealthTier-compatible 0-100
  isActive: boolean; // always true for "metric" — a measured funnel rate is definitionally already in place
  sourceMetricPoint?: DiagnosticPoint;
};

export type PriorityFactorHit = {
  condition: PriorityRuleCondition;
  factor: number;
  reason: string;
};

export type PriorityScoreBreakdown = {
  gainNormalise: number;
  pertinence: number;
  faisabilite: number;
  score: number;
  factorHits: PriorityFactorHit[];
  explanationPopover: string;
};

export type PriorityRecommendation = {
  candidate: PriorityCandidate;
  breakdown: PriorityScoreBreakdown;
  why: string;
};

function relativeGap(currentPercent: number, benchmarkPercent: number): number {
  return (benchmarkPercent - currentPercent) / benchmarkPercent;
}

function resolveReasonTemplate(template: string, tokens: Record<string, string | number>): string {
  return template.replace(/{{(\w+)}}/g, (match, key: string) => (key in tokens ? String(tokens[key]) : match));
}

function collectCandidates(points: DiagnosticPoint[], leverCandidates: LeverCandidateInput[]): PriorityCandidate[] {
  const metricCandidates: PriorityCandidate[] = points
    .filter((point) => point.monthlyGain !== null)
    .map((point) => ({
      type: "metric" as const,
      key: point.key,
      label: point.label,
      category: point.category,
      monthlyGainEur: point.monthlyGain as number,
      effort: METRIC_EFFORT[point.key],
      extraClientsPerMonth: point.extraClients,
      healthScore: computeHealthScore(point.currentRatePercent / 100, point.benchmarkRatePercent / 100, point.status),
      isActive: true,
      sourceMetricPoint: point,
    }));

  const leverPriorityCandidates: PriorityCandidate[] = leverCandidates
    .filter((lever) => lever.impactAmountEur !== null)
    .map((lever) => ({
      type: "lever" as const,
      key: lever.leverKey,
      label: lever.label,
      category: lever.category,
      monthlyGainEur: lever.impactAmountEur as number,
      effort: lever.effort,
      extraClientsPerMonth: null,
      healthScore: lever.healthScore,
      isActive: lever.isActive,
    }));

  return [...metricCandidates, ...leverPriorityCandidates];
}

// Dispatch by closed enum + jsonb params, never eval'd — same precedent as
// lib/levers/opportunities.ts's estimateImpact() switching on formulaType.
function evaluateRule(
  rule: PriorityRule,
  candidate: PriorityCandidate,
  context: { points: DiagnosticPoint[]; businessProfile: BusinessProfileData; monthlyRevenueEur: number }
): PriorityFactorHit | null {
  switch (rule.condition) {
    case "lever_revenue_gate": {
      if (candidate.type !== "lever" || candidate.key !== rule.params.leverKey) return null;
      const threshold = Number(rule.params.revenueThresholdEur);
      if (context.monthlyRevenueEur >= threshold) return null;
      return {
        condition: rule.condition,
        factor: rule.factor,
        reason: resolveReasonTemplate(rule.reasonTemplate, { monthlyRevenueEur: Math.round(context.monthlyRevenueEur) }),
      };
    }
    case "lever_requires_main_offer": {
      if (candidate.type !== "lever" || candidate.key !== rule.params.leverKey) return null;
      const hasMainOffer = context.businessProfile.sales.offers.some((offer) => offer.isMain);
      if (hasMainOffer) return null;
      return { condition: rule.condition, factor: rule.factor, reason: resolveReasonTemplate(rule.reasonTemplate, {}) };
    }
    case "metric_near_benchmark": {
      if (candidate.type !== "metric" || !candidate.sourceMetricPoint) return null;
      const point = candidate.sourceMetricPoint;
      const gap = relativeGap(point.currentRatePercent, point.benchmarkRatePercent);
      if (gap >= Number(rule.params.gapThresholdFraction)) return null;
      return {
        condition: rule.condition,
        factor: rule.factor,
        reason: resolveReasonTemplate(rule.reasonTemplate, {
          currentPercent: point.currentRatePercent,
          benchmarkPercent: point.benchmarkRatePercent,
        }),
      };
    }
    case "top_funnel_when_closing_leaks": {
      if (candidate.type !== "metric" || candidate.category !== "Setting") return null;
      const closingPoint = context.points.find((point) => point.key === "closingRate");
      if (!closingPoint) return null;
      const closingGap = relativeGap(closingPoint.currentRatePercent, closingPoint.benchmarkRatePercent);
      if (closingGap < Number(rule.params.closingGapThresholdFraction)) return null;
      return {
        condition: rule.condition,
        factor: rule.factor,
        reason: resolveReasonTemplate(rule.reasonTemplate, {
          closingCurrentPercent: closingPoint.currentRatePercent,
          closingBenchmarkPercent: closingPoint.benchmarkRatePercent,
        }),
      };
    }
    case "quick_win_low_effort": {
      if (candidate.effort !== "faible" || candidate.monthlyGainEur <= Number(rule.params.minGainEur)) return null;
      return {
        condition: rule.condition,
        factor: rule.factor,
        reason: resolveReasonTemplate(rule.reasonTemplate, {
          effort: EFFORT_LABEL[candidate.effort],
          gainEur: Math.round(candidate.monthlyGainEur),
        }),
      };
    }
  }
}

function buildWhy(candidate: PriorityCandidate, factorHits: PriorityFactorHit[]): string {
  const leadSentence = candidate.isActive
    ? `C'est ≈${formatEur(candidate.monthlyGainEur)}/mois à récupérer${
        candidate.extraClientsPerMonth ? ` (+${candidate.extraClientsPerMonth} clients/mois)` : ""
      }.`
    : `${candidate.label} n'est pas encore en place : ≈${formatEur(candidate.monthlyGainEur)}/mois de potentiel estimé.`;

  const effortSentence = `Effort ${EFFORT_LABEL[candidate.effort]} pour ${candidate.isActive ? "le corriger" : "le mettre en place"}.`;

  const strongestHit = [...factorHits].sort((a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1))[0];

  return [leadSentence, effortSentence, strongestHit?.reason].filter(Boolean).join(" ");
}

// Full scoring pass (gain × pertinence × faisabilité), sorted best-first,
// with NO confidence threshold and NO slice — computePriorityScores below
// applies both on top of this for its "confident top picks" hero use case.
// Exported separately for callers that want the complete ranked list
// instead (Diagnostic's Section 1 full list and Section 2's Ajouter sort,
// both reusing this exact formula rather than re-deriving a second one).
export function scoreCandidates({
  points,
  leverCandidates,
  businessProfile,
  monthlyRevenueEur,
  rules,
}: {
  points: DiagnosticPoint[];
  leverCandidates: LeverCandidateInput[];
  businessProfile: BusinessProfileData;
  monthlyRevenueEur: number;
  rules: PriorityRule[];
}): PriorityRecommendation[] {
  const candidates = collectCandidates(points, leverCandidates);
  if (candidates.length === 0) return [];

  const maxGain = Math.max(...candidates.map((c) => c.monthlyGainEur));

  const scored: PriorityRecommendation[] = candidates.map((candidate) => {
    const gainNormalise = maxGain > 0 ? candidate.monthlyGainEur / maxGain : 0;
    const faisabilite = EFFORT_FAISABILITE_FACTOR[candidate.effort];

    const factorHits = rules
      .map((rule) => evaluateRule(rule, candidate, { points, businessProfile, monthlyRevenueEur }))
      .filter((hit): hit is PriorityFactorHit => hit !== null);
    const pertinence = Math.min(1, factorHits.reduce((product, hit) => product * hit.factor, 1));

    const score = Math.round(gainNormalise * pertinence * faisabilite * 100);

    const factorsLabel =
      factorHits.length > 0 ? ` (${factorHits.map((hit) => `×${hit.factor}`).join(", ")}${pertinence === 1 && factorHits.some((h) => h.factor > 1) ? ", plafonné à 1" : ""})` : "";
    const explanationPopover = `Gain ${gainNormalise.toFixed(2)} × Pertinence ${pertinence.toFixed(2)} × Faisabilité ${faisabilite.toFixed(2)} = ${score}${factorsLabel}`;

    return {
      candidate,
      breakdown: { gainNormalise, pertinence, faisabilite, score, factorHits, explanationPopover },
      why: buildWhy(candidate, factorHits),
    };
  });

  return scored.sort((a, b) => b.breakdown.score - a.breakdown.score);
}

export function computePriorityScores(args: {
  points: DiagnosticPoint[];
  leverCandidates: LeverCandidateInput[];
  businessProfile: BusinessProfileData;
  monthlyRevenueEur: number;
  rules: PriorityRule[];
}): { recommendations: PriorityRecommendation[] } {
  return {
    recommendations: scoreCandidates(args)
      .filter((r) => r.breakdown.score > PRIORITY_THRESHOLD)
      .slice(0, MAX_RECOMMENDATIONS),
  };
}
