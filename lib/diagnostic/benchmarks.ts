import { eq, isNull } from "drizzle-orm";
import { unstable_cache } from "next/cache";
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
// cache()-wrapped (per-request dedup: called independently by
// app/(app)/layout.tsx for the Scale Score badge and by whichever page also
// needs the diagnostic engine — Dashboard, Diagnostic, Overview, Copilote,
// Ads — on every navigation) around unstable_cache (cross-request: this
// table only changes via a seed script, never from in-app writes, so there's
// no revalidateTag call site — every user on every request was otherwise
// re-querying the same handful of rows).
const getBenchmarkSnapshotCached = unstable_cache(
  async (sector: SectorKey | null): Promise<Record<string, number>> => {
    const [rows, globalRows] = await Promise.all([
      sector ? db.select().from(benchmarks).where(eq(benchmarks.sector, sector)) : Promise.resolve([]),
      db.select().from(benchmarks).where(isNull(benchmarks.sector)),
    ]);

    const result: Record<string, number> = {};
    for (const row of globalRows) result[row.metricKey] = row.value;
    for (const row of rows) result[row.metricKey] = row.value;
    return result;
  },
  ["diagnostic-benchmark-snapshot"],
  { revalidate: 3600 }
);

export const getBenchmarkSnapshot = cache(getBenchmarkSnapshotCached);

export const getDiagnosticBenchmarks = cache(async (sector: SectorKey | null): Promise<Record<MetricKey, number>> => {
  const snapshot = await getBenchmarkSnapshot(sector);
  const result = {} as Record<MetricKey, number>;
  for (const key of METRIC_KEYS) {
    result[key] = snapshot[key] ?? 0;
  }
  return result;
});
