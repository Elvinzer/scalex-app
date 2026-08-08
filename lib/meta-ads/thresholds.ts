function configuredNumber(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= minimum && value <= maximum ? value : fallback;
}

/**
 * Shared Meta Ads reading thresholds. The server uses the configured values
 * for diagnosis; the dashboard receives the display-only saturation threshold
 * from its server query so custom deployments never show a misleading value.
 */
export const META_INSIGHT_THRESHOLDS = {
  minImpressions: Math.round(configuredNumber("META_INSIGHT_MIN_IMPRESSIONS", 1_000, 1, 10_000_000)),
  minClicks: Math.round(configuredNumber("META_INSIGHT_MIN_CLICKS", 50, 1, 1_000_000)),
  minProfileVisits: Math.round(configuredNumber("META_INSIGHT_MIN_PROFILE_VISITS", 50, 1, 1_000_000)),
  minCoverage: configuredNumber("META_INSIGHT_MIN_COVERAGE_PERCENT", 80, 0.1, 100) / 100,
  vslHoldRate: configuredNumber("META_INSIGHT_VSL_HOLD_RATE_PERCENT", 20, 0.1, 100) / 100,
  vslLandingToLeadRate: configuredNumber("META_INSIGHT_VSL_LANDING_TO_LEAD_RATE_PERCENT", 10, 0.1, 100) / 100,
  vslCplStability: configuredNumber("META_INSIGHT_VSL_CPL_STABILITY_PERCENT", 20, 0.1, 100) / 100,
  vslCashPerLeadDecline: configuredNumber("META_INSIGHT_VSL_CASH_PER_LEAD_DECLINE_PERCENT", 20, 0.1, 100) / 100,
  igFollowRate: configuredNumber("META_INSIGHT_IG_FOLLOW_RATE_PERCENT", 10, 0.1, 100) / 100,
  igCostPerVisitImprovement: configuredNumber("META_INSIGHT_IG_COST_PER_VISIT_IMPROVEMENT_PERCENT", 10, 0.1, 100) / 100,
  igFollowsGrowth: configuredNumber("META_INSIGHT_IG_FOLLOWS_GROWTH_PERCENT", 10, 0.1, 100) / 100,
  igEngagementDecline: configuredNumber("META_INSIGHT_IG_ENGAGEMENT_DECLINE_PERCENT", 10, 0.1, 100) / 100,
  retargetingFrequencyIncrease: configuredNumber("META_INSIGHT_RETARGETING_FREQUENCY_INCREASE_PERCENT", 10, 0.1, 100) / 100,
  retargetingCtrDecline: configuredNumber("META_INSIGHT_RETARGETING_CTR_DECLINE_PERCENT", 10, 0.1, 100) / 100,
  retargetingCpaIncrease: configuredNumber("META_INSIGHT_RETARGETING_CPA_INCREASE_PERCENT", 10, 0.1, 100) / 100,
  retargetingFrequencySaturation: configuredNumber("META_INSIGHT_RETARGETING_FREQUENCY_SATURATION", 3, 1, 100),
  retargetingWindowCpaRatio: configuredNumber("META_INSIGHT_RETARGETING_WINDOW_CPA_RATIO", 1.5, 1, 100),
  retargetingMinWindowLeads: Math.round(configuredNumber("META_INSIGHT_RETARGETING_MIN_WINDOW_LEADS", 5, 1, 1_000_000)),
} as const;
