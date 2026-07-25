import { eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { benchmarks } from "@/db/schema";
import type { SectorKey } from "@/lib/benchmarks";

// The pipeline Kanban's own closing-rate benchmark (leads travaillés ->
// closés) — deliberately separate from lib/diagnostic/benchmarks.ts's
// getDiagnosticBenchmarks, which is hard-locked to the 5 cascade metrics
// (metric-keys.ts). Same sibling-file pattern as
// lib/diagnostic/content-metrics.ts's getContentDiagnosticBenchmarks, one
// key instead of an array since there's only one pipeline metric today.
export async function getPipelineDiagnosticBenchmark(sector: SectorKey | null): Promise<number> {
  const [sectorRows, globalRows] = await Promise.all([
    sector
      ? db.select().from(benchmarks).where(eq(benchmarks.sector, sector))
      : Promise.resolve([]),
    db.select().from(benchmarks).where(isNull(benchmarks.sector)),
  ]);

  const sectorRow = sectorRows.find((row) => row.metricKey === "pipeline_closing_rate");
  const globalRow = globalRows.find((row) => row.metricKey === "pipeline_closing_rate");
  return sectorRow?.value ?? globalRow?.value ?? 0;
}
