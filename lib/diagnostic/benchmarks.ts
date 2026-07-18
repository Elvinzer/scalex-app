import { eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { benchmarks } from "@/db/schema";
import type { SectorKey } from "@/lib/benchmarks";

export type MetricKey = "responseRate" | "proposalRate" | "bookingRate" | "showUpRate" | "closingRate";

export const METRIC_KEYS: MetricKey[] = [
  "responseRate",
  "proposalRate",
  "bookingRate",
  "showUpRate",
  "closingRate",
];

// Sector-specific row wins per metric; falls back to the global (sector
// null) row. Lives in DB per lib/diagnostic/cascade.ts's plan doc — distinct
// from lib/benchmarks.ts's 3-tier band system, which keeps driving the
// Funnel's existing tiles/meters untouched.
export async function getDiagnosticBenchmarks(sector: SectorKey | null): Promise<Record<MetricKey, number>> {
  const rows = sector
    ? await db.select().from(benchmarks).where(eq(benchmarks.sector, sector))
    : [];
  const globalRows = await db.select().from(benchmarks).where(isNull(benchmarks.sector));

  const result = {} as Record<MetricKey, number>;
  for (const key of METRIC_KEYS) {
    const sectorRow = rows.find((row) => row.metricKey === key);
    const globalRow = globalRows.find((row) => row.metricKey === key);
    result[key] = sectorRow?.value ?? globalRow?.value ?? 0;
  }
  return result;
}
