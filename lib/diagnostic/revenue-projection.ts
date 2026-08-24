export const REVENUE_PROJECTION_MONTHS = 4;

export type RevenueProjection = {
  averageMonthlyRevenue: number | null;
  bottleneckGain: number | null;
  optimizedMonthlyRevenue: number | null;
  topLeverGains: number[];
  potentialMonthlyRevenue: number | null;
};

function positiveGains(values: number[]): number[] {
  return values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)
    .slice(0, 3)
    .map((value) => Math.round(value));
}

export function buildRevenueProjection({
  cashContractedTotal,
  monthsCount,
  bottleneckGain,
  leverGains = [],
}: {
  cashContractedTotal: number;
  monthsCount: number;
  bottleneckGain: number | null;
  leverGains?: number[];
}): RevenueProjection {
  const averageMonthlyRevenue = cashContractedTotal > 0 && monthsCount > 0
    ? Math.round(cashContractedTotal / monthsCount)
    : null;
  const safeBottleneckGain = bottleneckGain === null || !Number.isFinite(bottleneckGain)
    ? null
    : Math.max(0, Math.round(bottleneckGain));
  const optimizedMonthlyRevenue = averageMonthlyRevenue === null
    ? null
    : averageMonthlyRevenue + (safeBottleneckGain ?? 0);
  const topLeverGains = positiveGains(leverGains);
  const potentialMonthlyRevenue = optimizedMonthlyRevenue === null
    ? null
    : optimizedMonthlyRevenue + topLeverGains.reduce((sum, gain) => sum + gain, 0);

  return {
    averageMonthlyRevenue,
    bottleneckGain: safeBottleneckGain,
    optimizedMonthlyRevenue,
    topLeverGains,
    potentialMonthlyRevenue,
  };
}
