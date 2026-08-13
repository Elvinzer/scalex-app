import { z } from "zod";

const nonNegativeMetric = z.number().finite().min(0).max(1_000_000_000).nullable();

export const freeDiagnosticInputSchema = z.object({
  niche: z.string().trim().min(1).max(120),
  offer: z.string().trim().min(1).max(160),
  price: z.number().finite().min(0).max(10_000_000),
  audience: nonNegativeMetric,
  leads: nonNegativeMetric,
  appointments: nonNegativeMetric,
  sales: nonNegativeMetric,
  revenue: nonNegativeMetric,
});

export type FreeDiagnosticInput = z.infer<typeof freeDiagnosticInputSchema>;

export type FreeDiagnosticBottleneck = "acquisition" | "sales" | "conversion";

export type FreeDiagnosticResult = {
  score: number | null;
  bottleneck: FreeDiagnosticBottleneck | null;
  currentRate: number | null;
  benchmarkRate: number | null;
  estimatedGain: number | null;
  measuredSignals: number;
};

const BENCHMARKS: Record<FreeDiagnosticBottleneck, number> = {
  acquisition: 0.05,
  sales: 0.15,
  conversion: 0.25,
};

function ratio(value: number | null, base: number | null): number | null {
  if (value === null || base === null || base <= 0) return null;
  return value / base;
}

export function calculateFreeDiagnostic(input: FreeDiagnosticInput): FreeDiagnosticResult {
  const rates: Array<{ key: FreeDiagnosticBottleneck; currentRate: number | null; benchmarkRate: number }> = [
    {
      key: "acquisition",
      currentRate: ratio(input.leads, input.audience),
      benchmarkRate: BENCHMARKS.acquisition,
    },
    {
      key: "sales",
      currentRate: ratio(input.appointments, input.leads),
      benchmarkRate: BENCHMARKS.sales,
    },
    {
      key: "conversion",
      currentRate: ratio(input.sales, input.appointments),
      benchmarkRate: BENCHMARKS.conversion,
    },
  ];
  const measured = rates.filter((metric) => metric.currentRate !== null);

  if (measured.length === 0) {
    return {
      score: null,
      bottleneck: null,
      currentRate: null,
      benchmarkRate: null,
      estimatedGain: null,
      measuredSignals: 0,
    };
  }

  const healthRatios = measured.map((metric) => Math.min(1, (metric.currentRate ?? 0) / metric.benchmarkRate));
  const score = Math.round((healthRatios.reduce((sum, value) => sum + value, 0) / measured.length) * 100);
  const bottleneck = measured.reduce((lowest, metric) => {
    const currentGap = (metric.currentRate ?? 0) / metric.benchmarkRate;
    const lowestGap = (lowest.currentRate ?? 0) / lowest.benchmarkRate;
    return currentGap < lowestGap ? metric : lowest;
  });
  const revenue = input.revenue ?? (input.sales !== null ? input.sales * input.price : null);
  const gap = Math.max(0, 1 - (bottleneck.currentRate ?? 0) / bottleneck.benchmarkRate);

  return {
    score,
    bottleneck: bottleneck.key,
    currentRate: bottleneck.currentRate,
    benchmarkRate: bottleneck.benchmarkRate,
    estimatedGain: revenue !== null && revenue > 0 ? Math.round(revenue * gap) : null,
    measuredSignals: measured.length,
  };
}
