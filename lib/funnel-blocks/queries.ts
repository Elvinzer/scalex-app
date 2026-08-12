import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db";
import { funnelBlockBenchmarks, funnelBlocks } from "@/db/schema";
import type { SectorKey } from "@/lib/benchmarks";

import { DEFAULT_FUNNEL_BLOCK_BENCHMARKS, DEFAULT_FUNNEL_BLOCKS } from "./catalog";
import { isFunnelBlockFamily, type FunnelBlockCatalogEntry, type FunnelBlockFamily } from "./types";

function normalizeRow(row: typeof funnelBlocks.$inferSelect): FunnelBlockCatalogEntry | null {
  if (!isFunnelBlockFamily(row.family) || !Array.isArray(row.steps)) return null;
  return {
    blockKey: row.blockKey,
    family: row.family,
    label: row.label,
    description: row.description,
    steps: row.steps,
    example: row.example,
  };
}

export const getFunnelBlockCatalog = cache(async (): Promise<FunnelBlockCatalogEntry[]> => {
  const rows = await db.select().from(funnelBlocks).where(eq(funnelBlocks.enabled, true));
  const catalog = rows.map(normalizeRow).filter((entry): entry is FunnelBlockCatalogEntry => entry !== null);
  return catalog.length > 0 ? catalog : DEFAULT_FUNNEL_BLOCKS;
});

export const getFunnelBlockBenchmarks = cache(async (
  blockKeys: string[],
  sector: SectorKey | null
): Promise<Record<string, number | null>> => {
  if (blockKeys.length === 0) return {};
  const rows = await db
    .select()
    .from(funnelBlockBenchmarks)
    .where(
      and(
        inArray(funnelBlockBenchmarks.blockKey, blockKeys),
        or(isNull(funnelBlockBenchmarks.sector), sector ? eq(funnelBlockBenchmarks.sector, sector) : isNull(funnelBlockBenchmarks.sector))
      )
    );
  const result: Record<string, number | null> = {};
  for (const row of rows) {
    const key = `${row.blockKey}:${row.benchmarkKey}`;
    if (row.sector === null || result[key] === undefined) result[key] = row.value;
    if (sector !== null && row.sector === sector) result[key] = row.value;
  }
  for (const blockKey of blockKeys) {
    for (const [benchmarkKey, value] of Object.entries(DEFAULT_FUNNEL_BLOCK_BENCHMARKS[blockKey] ?? {})) {
      const key = `${blockKey}:${benchmarkKey}`;
      if (result[key] === undefined) result[key] = value;
    }
  }
  return result;
});

export function funnelBlockBenchmarkFor(
  benchmarks: Record<string, number | null>,
  blockKey: string,
  benchmarkKey: string | null
): number | null {
  return benchmarkKey === null ? null : benchmarks[`${blockKey}:${benchmarkKey}`] ?? null;
}

export function blockKeysByFamily(catalog: FunnelBlockCatalogEntry[], family: FunnelBlockFamily): string[] {
  return catalog.filter((entry) => entry.family === family).map((entry) => entry.blockKey);
}
