import { describe, expect, it } from "vitest";

import { EMPTY_BUSINESS_PROFILE, type BusinessProfileData, type Offer } from "@/lib/business/types";

import type { DiagnosticPoint } from "./cascade";
import { computePriorityScores, type LeverCandidateInput } from "./priority";
import type { PriorityRule } from "./priority-rules";

const RULES: PriorityRule[] = [
  {
    id: "r-ads-revenue",
    condition: "lever_revenue_gate",
    params: { leverKey: "ads", revenueThresholdEur: 3000 },
    factor: 0.15,
    reasonTemplate: "Ton CA mensuel actuel (≈{{monthlyRevenueEur}}€) ne justifie pas encore la pub.",
  },
  {
    id: "r-upsell-offer",
    condition: "lever_requires_main_offer",
    params: { leverKey: "upsell_ascension" },
    factor: 0.2,
    reasonTemplate: "Ton offre principale doit être carrée avant d'empiler un upsell.",
  },
  {
    id: "r-near-benchmark",
    condition: "metric_near_benchmark",
    params: { gapThresholdFraction: 0.15 },
    factor: 0.6,
    reasonTemplate: "Ton taux ({{currentPercent}}%) est déjà proche du benchmark ({{benchmarkPercent}}%).",
  },
  {
    id: "r-top-funnel",
    condition: "top_funnel_when_closing_leaks",
    params: { closingGapThresholdFraction: 0.3 },
    factor: 0.5,
    reasonTemplate: "Inutile d'amener plus de gens tant que ton closing ({{closingCurrentPercent}}% vs {{closingBenchmarkPercent}}%) fuit.",
  },
  {
    id: "r-quick-win",
    condition: "quick_win_low_effort",
    params: { minGainEur: 500 },
    factor: 1.3,
    reasonTemplate: "Effort {{effort}} pour ≈{{gainEur}}€/mois : un quick win.",
  },
];

function point(overrides: Partial<DiagnosticPoint> & Pick<DiagnosticPoint, "key">): DiagnosticPoint {
  return {
    category: "Setting",
    label: "Test metric",
    status: "critical",
    currentRatePercent: 10,
    benchmarkRatePercent: 30,
    extraClients: 5,
    monthlyGain: 1000,
    yearlyGain: null,
    isPriceFallback: false,
    explanation: "",
    tooltip: "",
    ...overrides,
  };
}

// Absent-lever candidate (mirrors what /diagnostic passes — isActive: false).
function absentLever(overrides: Partial<LeverCandidateInput> & Pick<LeverCandidateInput, "leverKey">): LeverCandidateInput {
  return {
    label: "Test lever",
    category: "acquisition",
    effort: "moyen",
    impactAmountEur: 1000,
    healthScore: 0,
    isActive: false,
    ...overrides,
  };
}

function withMainOffer(): BusinessProfileData {
  const mainOffer: Offer = { id: "1", name: "Offre principale", price: 2000, type: "coaching", saleMode: "appel_closing", recurrence: "one_shot", isMain: true };
  return { ...EMPTY_BUSINESS_PROFILE, sales: { ...EMPTY_BUSINESS_PROFILE.sales, offers: [mainOffer] } };
}

describe("computePriorityScores", () => {
  it("demotes a big-€ ads opportunity below the threshold when monthly revenue is too low", () => {
    const { recommendations } = computePriorityScores({
      points: [],
      leverCandidates: [absentLever({ leverKey: "ads", impactAmountEur: 5000, effort: "moyen" })],
      businessProfile: EMPTY_BUSINESS_PROFILE,
      monthlyRevenueEur: 1000,
      rules: RULES,
    });

    expect(recommendations).toHaveLength(0);
  });

  it("demotes an upsell opportunity below the threshold when there is no main offer", () => {
    const { recommendations } = computePriorityScores({
      points: [],
      leverCandidates: [absentLever({ leverKey: "upsell_ascension", impactAmountEur: 5000, effort: "moyen" })],
      businessProfile: EMPTY_BUSINESS_PROFILE,
      monthlyRevenueEur: 10000,
      rules: RULES,
    });

    expect(recommendations).toHaveLength(0);
  });

  it("does not demote the same ads/upsell opportunities once revenue and main offer are present", () => {
    const { recommendations } = computePriorityScores({
      points: [],
      leverCandidates: [
        absentLever({ leverKey: "ads", impactAmountEur: 5000, effort: "moyen" }),
        absentLever({ leverKey: "upsell_ascension", impactAmountEur: 4000, effort: "moyen" }),
      ],
      businessProfile: withMainOffer(),
      monthlyRevenueEur: 10000,
      rules: RULES,
    });

    expect(recommendations.length).toBeGreaterThan(0);
  });

  it("applies the metric_near_benchmark factor when a caution point is close to its benchmark", () => {
    // monthlyGain kept at/below the quick-win threshold (500) so that rule
    // doesn't also fire and muddy the isolated pertinence assertion below.
    const nearPoint = point({ key: "responseRate", status: "caution", currentRatePercent: 29, benchmarkRatePercent: 30, monthlyGain: 400 });
    const { recommendations } = computePriorityScores({
      points: [nearPoint],
      leverCandidates: [],
      businessProfile: EMPTY_BUSINESS_PROFILE,
      monthlyRevenueEur: 10000,
      rules: RULES,
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].breakdown.pertinence).toBeCloseTo(0.6);
    expect(recommendations[0].breakdown.factorHits.map((h) => h.condition)).toContain("metric_near_benchmark");
  });

  it("applies top_funnel_when_closing_leaks to a Setting candidate when closingRate leaks hard", () => {
    const settingPoint = point({ key: "responseRate", category: "Setting", currentRatePercent: 10, benchmarkRatePercent: 30, monthlyGain: 2000 });
    const closingPoint = point({ key: "closingRate", category: "Closing", currentRatePercent: 5, benchmarkRatePercent: 20, monthlyGain: 500 });
    const { recommendations } = computePriorityScores({
      points: [settingPoint, closingPoint],
      leverCandidates: [],
      businessProfile: EMPTY_BUSINESS_PROFILE,
      monthlyRevenueEur: 10000,
      rules: RULES,
    });

    const settingReco = recommendations.find((r) => r.candidate.key === "responseRate");
    expect(settingReco?.breakdown.factorHits.map((h) => h.condition)).toContain("top_funnel_when_closing_leaks");
  });

  it("boosts a low-effort quick win and caps cumulative pertinence at 1", () => {
    const doubleBoostRules: PriorityRule[] = [RULES[4], RULES[4]]; // same quick-win condition applied twice, synthetic — only to exercise the cap
    const quickWinPoint = point({ key: "responseRate", currentRatePercent: 10, benchmarkRatePercent: 30, monthlyGain: 1000 });
    const { recommendations } = computePriorityScores({
      points: [quickWinPoint],
      leverCandidates: [],
      businessProfile: EMPTY_BUSINESS_PROFILE,
      monthlyRevenueEur: 10000,
      rules: doubleBoostRules,
    });

    expect(recommendations[0].breakdown.pertinence).toBe(1);
  });

  it("returns exactly one recommendation when only one candidate clears the threshold", () => {
    const strongPoint = point({ key: "responseRate", currentRatePercent: 10, benchmarkRatePercent: 30, monthlyGain: 3000 });
    const weakLever = absentLever({ leverKey: "ads", impactAmountEur: 5000, effort: "moyen" }); // demoted by revenue gate

    const { recommendations } = computePriorityScores({
      points: [strongPoint],
      leverCandidates: [weakLever],
      businessProfile: EMPTY_BUSINESS_PROFILE,
      monthlyRevenueEur: 1000,
      rules: RULES,
    });

    expect(recommendations).toHaveLength(1);
    expect(recommendations[0].candidate.key).toBe("responseRate");
  });

  it("returns an empty array (no padding) when every candidate falls below the threshold", () => {
    // High effort (élevé -> faisabilité 0.45) stacked with the near-benchmark
    // penalty (0.6) keeps this one under PRIORITY_THRESHOLD on its own.
    const nearBenchmarkPoint = point({ key: "closingRate", category: "Closing", status: "caution", currentRatePercent: 29, benchmarkRatePercent: 30, monthlyGain: 100 });
    // Much bigger raw € than the point above, so it dominates gain_normalisé
    // and leaves the point's own normalized gain tiny — on top of being
    // gated by low revenue itself.
    const gatedLever = absentLever({ leverKey: "ads", impactAmountEur: 5000, effort: "eleve" });

    const { recommendations } = computePriorityScores({
      points: [nearBenchmarkPoint],
      leverCandidates: [gatedLever],
      businessProfile: EMPTY_BUSINESS_PROFILE,
      monthlyRevenueEur: 1000,
      rules: RULES,
    });

    expect(recommendations).toHaveLength(0);
  });

  it("never treats a null-impact metric point or lever opportunity as a candidate", () => {
    const unpriced = point({ key: "responseRate", monthlyGain: null });
    const unestimated = absentLever({ leverKey: "seo_blog", impactAmountEur: null });

    const { recommendations } = computePriorityScores({
      points: [unpriced],
      leverCandidates: [unestimated],
      businessProfile: EMPTY_BUSINESS_PROFILE,
      monthlyRevenueEur: 10000,
      rules: RULES,
    });

    expect(recommendations).toHaveLength(0);
  });
});
