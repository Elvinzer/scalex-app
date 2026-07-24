import { eq, isNull } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { benchmarks } from "@/db/schema";
import type { SectorKey } from "@/lib/benchmarks";

// Re-exported for every existing server-side import site — kept here so
// nothing else needs to change. Client components should import from
// ./metric-keys directly instead (see that file's comment for why).
export { METRIC_KEYS, type MetricKey } from "./metric-keys";
import { METRIC_KEYS, type MetricKey } from "./metric-keys";

// Sector-specific row wins per metric; falls back to the global (sector
// null) row. Lives in DB per lib/diagnostic/cascade.ts's plan doc — distinct
// from lib/benchmarks.ts's 3-tier band system, which keeps driving the
// Funnel's existing tiles/meters untouched.
// cache()-wrapped: called independently by app/(app)/layout.tsx (Scale
// Score badge) and by whichever page also needs the diagnostic engine
// (Dashboard, Diagnostic, Overview, Copilote, Ads) on every navigation —
// same sector, same rows, deduped per request like getAccountContext.
export const getDiagnosticBenchmarks = cache(async (sector: SectorKey | null): Promise<Record<MetricKey, number>> => {
  const [rows, globalRows] = await Promise.all([
    sector ? db.select().from(benchmarks).where(eq(benchmarks.sector, sector)) : Promise.resolve([]),
    db.select().from(benchmarks).where(isNull(benchmarks.sector)),
  ]);

  const result = {} as Record<MetricKey, number>;
  for (const key of METRIC_KEYS) {
    const sectorRow = rows.find((row) => row.metricKey === key);
    const globalRow = globalRows.find((row) => row.metricKey === key);
    result[key] = sectorRow?.value ?? globalRow?.value ?? 0;
  }
  return result;
});
