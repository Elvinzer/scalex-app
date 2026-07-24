import type { BusinessProfileData } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";
import type { LeverOpportunity } from "@/lib/levers/opportunities";

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

export type PriorityCandidate = {
  type: "metric" | "lever";
  key: string; // MetricKey for "metric", leverKey for "lever"
  label: string;
  category: string;
  monthlyGainEur: number; // never null here — null-impact candidates are excluded before this type exists
  effort: Effort;
  extraClientsPerMonth: number | null; // metric only; levers have no comparable field
  healthScore: number; // getHealthTier-compatible 0-100; fixed at 0 for an absent lever (no measured rate to place it)
  sourceMetricPoint?: DiagnosticPoint;
  sourceLeverOpportunity?: LeverOpportunity;
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

function collectCandidates(points: DiagnosticPoint[], discoveryOpportunities: LeverOpportunity[]): PriorityCandidate[] {
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
      sourceMetricPoint: point,
    }));

  const leverCandidates: PriorityCandidate[] = discoveryOpportunities
    .filter((opportunity) => opportunity.impactAmountEur !== null)
    .map((opportunity) => ({
      type: "lever" as const,
      key: opportunity.leverKey,
      label: opportunity.label,
      category: opportunity.category,
      monthlyGainEur: opportunity.impactAmountEur as number,
      effort: opportunity.effort,
      extraClientsPerMonth: null,
      healthScore: 0,
      sourceLeverOpportunity: opportunity,
    }));

  return [...metricCandidates, ...leverCandidates];
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
  const leadSentence =
    candidate.type === "metric"
      ? `C'est ≈${formatEur(candidate.monthlyGainEur)}/mois à récupérer${
          candidate.extraClientsPerMonth ? ` (+${candidate.extraClientsPerMonth} clients/mois)` : ""
        }.`
      : `${candidate.label} n'est pas encore en place : ≈${formatEur(candidate.monthlyGainEur)}/mois de potentiel estimé.`;

  const effortSentence = `Effort ${EFFORT_LABEL[candidate.effort]} pour ${candidate.type === "metric" ? "le corriger" : "le mettre en place"}.`;

  const strongestHit = [...factorHits].sort((a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1))[0];

  return [leadSentence, effortSentence, strongestHit?.reason].filter(Boolean).join(" ");
}

export function computePriorityScores({
  points,
  discoveryOpportunities,
  businessProfile,
  monthlyRevenueEur,
  rules,
}: {
  points: DiagnosticPoint[];
  discoveryOpportunities: LeverOpportunity[];
  businessProfile: BusinessProfileData;
  monthlyRevenueEur: number;
  rules: PriorityRule[];
}): { recommendations: PriorityRecommendation[] } {
  const candidates = collectCandidates(points, discoveryOpportunities);
  if (candidates.length === 0) return { recommendations: [] };

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

  return {
    recommendations: scored
      .sort((a, b) => b.breakdown.score - a.breakdown.score)
      .filter((r) => r.breakdown.score > PRIORITY_THRESHOLD)
      .slice(0, MAX_RECOMMENDATIONS),
  };
}
