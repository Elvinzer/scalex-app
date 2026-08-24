import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { acquisitionFunnelBenchmarks, acquisitionFunnels } from "@/db/schema";
import type { SectorKey } from "@/lib/benchmarks";

import { DEFAULT_ACQUISITION_FUNNELS } from "./catalog";
import type { AcquisitionFunnelBenchmark, AcquisitionFunnelCatalogEntry, AcquisitionFunnelKey } from "./types";
import { isAcquisitionFunnelKey } from "./types";

function normalizeCatalogRow(row: typeof acquisitionFunnels.$inferSelect): AcquisitionFunnelCatalogEntry | null {
  if (!isAcquisitionFunnelKey(row.funnelKey) || !Array.isArray(row.steps)) return null;
  return {
    funnelKey: row.funnelKey,
    label: row.label,
    description: row.description,
    steps: row.steps,
  };
}

export const getAcquisitionFunnelCatalog = cache(async (): Promise<AcquisitionFunnelCatalogEntry[]> => {
  const rows = await db.select().from(acquisitionFunnels).where(eq(acquisitionFunnels.enabled, true));
  const catalog = rows
    .map(normalizeCatalogRow)
    .filter((entry): entry is AcquisitionFunnelCatalogEntry => entry !== null)
    .filter((entry) => entry.funnelKey !== "appel_direct");
  const fallback = DEFAULT_ACQUISITION_FUNNELS.filter((entry) => entry.funnelKey !== "appel_direct");
  return catalog.length > 0 ? catalog : fallback;
});

export const getAcquisitionFunnelBenchmarks = cache(async (
  funnelKeys: AcquisitionFunnelKey[],
  sector: SectorKey | null
): Promise<Record<string, number | null>> => {
  if (funnelKeys.length === 0) return {};
  const rows = await db
    .select()
    .from(acquisitionFunnelBenchmarks)
    .where(
      and(
        inArray(acquisitionFunnelBenchmarks.funnelKey, funnelKeys),
        or(isNull(acquisitionFunnelBenchmarks.sector), sector ? eq(acquisitionFunnelBenchmarks.sector, sector) : isNull(acquisitionFunnelBenchmarks.sector))
      )
    );
  const result: Record<string, number | null> = {};
  for (const row of rows) {
    const key = `${row.funnelKey}:${row.benchmarkKey}`;
    if (row.sector === null || result[key] === undefined) result[key] = row.value;
    if (sector !== null && row.sector === sector) result[key] = row.value;
  }
  return result;
});

export function benchmarkFor(
  benchmarks: Record<string, number | null>,
  funnelKey: AcquisitionFunnelKey,
  benchmarkKey: string | null
): number | null {
  return benchmarkKey === null ? null : benchmarks[`${funnelKey}:${benchmarkKey}`] ?? null;
}

export function toAcquisitionBenchmarkRows(
  funnelKey: AcquisitionFunnelKey,
  values: Record<string, number>,
  sector: SectorKey | null = null
): AcquisitionFunnelBenchmark[] {
  return Object.entries(values).map(([benchmarkKey, value]) => ({ funnelKey, benchmarkKey, value, sector }));
}
