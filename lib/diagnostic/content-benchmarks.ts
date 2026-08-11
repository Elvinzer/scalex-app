import type { SectorKey } from "@/lib/benchmarks";

import { CONTENT_METRIC_KEYS, type ContentMetricKey } from "./content-metrics";
import { getBenchmarkSnapshot } from "./benchmarks";

// Split out of content-metrics.ts so that file stays free of any "@/db"
// import: the rate/gain maths around it is pure and has to be unit-testable
// without a DATABASE_URL (same reason lib/youtube/attribution-rules.ts is
// separate from attribution.ts).
export async function getContentDiagnosticBenchmarks(
  sector: SectorKey | null
): Promise<Record<ContentMetricKey, number>> {
  const snapshot = await getBenchmarkSnapshot(sector);
  const result = {} as Record<ContentMetricKey, number>;
  for (const key of CONTENT_METRIC_KEYS) {
    result[key] = snapshot[key] ?? 0;
  }
  return result;
}
