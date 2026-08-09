import { eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { benchmarks } from "@/db/schema";
import type { SectorKey } from "@/lib/benchmarks";

import { CONTENT_METRIC_KEYS, type ContentMetricKey } from "./content-metrics";

// Split out of content-metrics.ts so that file stays free of any "@/db"
// import: the rate/gain maths around it is pure and has to be unit-testable
// without a DATABASE_URL (same reason lib/youtube/attribution-rules.ts is
// separate from attribution.ts).
export async function getContentDiagnosticBenchmarks(
  sector: SectorKey | null
): Promise<Record<ContentMetricKey, number>> {
  const [rows, globalRows] = await Promise.all([
    sector ? db.select().from(benchmarks).where(eq(benchmarks.sector, sector)) : Promise.resolve([]),
    db.select().from(benchmarks).where(isNull(benchmarks.sector)),
  ]);

  const result = {} as Record<ContentMetricKey, number>;
  for (const key of CONTENT_METRIC_KEYS) {
    const sectorRow = rows.find((row) => row.metricKey === key);
    const globalRow = globalRows.find((row) => row.metricKey === key);
    result[key] = sectorRow?.value ?? globalRow?.value ?? 0;
  }
  return result;
}
