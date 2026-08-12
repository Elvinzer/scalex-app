import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";

import type { FunnelBlockCatalogEntry, FunnelSourceKey } from "./types";

export type FunnelBlockStage = {
  id: string;
  blockKey: string;
  metricKey: string;
  label: string;
  unit: string;
  volume: number | null;
  currentRate: number | null;
  benchmarkRate: number | null;
  healthScore: number | null;
  isReliable: boolean;
};

const SCALAR_VALUES: Record<string, keyof MonthlyMetricsRow> = {
  new_followers: "newFollowers",
  first_messages: "firstMessages",
  conversations: "conversations",
  calls_proposed: "callsProposed",
  calls_booked: "callsBooked",
  calls_attended: "callsTaken",
  sales_closed: "salesClosed",
};

const LEGACY_METRIC_ALIASES: Record<string, string[]> = {
  lead_magnet_clicks: ["content_clicks"],
  lead_magnet_optins: ["content_leads"],
  event_registrants: ["webinar_registrants", "challenge_registrants"],
  email_sends: ["newsletter_sends"],
  email_opens: ["newsletter_opens"],
  email_clicks: ["newsletter_offer_clicks"],
  challenge_participants: ["challenge_registrants"],
};

function funnelBlockBenchmarkFor(
  benchmarks: Record<string, number | null>,
  blockKey: string,
  benchmarkKey: string | null
): number | null {
  return benchmarkKey === null ? null : benchmarks[`${blockKey}:${benchmarkKey}`] ?? null;
}

function normalizeValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function metricValueForSource(
  row: MonthlyMetricsRow | null,
  metricKey: string,
  source: FunnelSourceKey | "total"
): number | null {
  if (!row) return null;
  if (source !== "total") return normalizeValue(row.acquisitionSourceMetrics?.[source]?.[metricKey]);
  const scalarKey = SCALAR_VALUES[metricKey];
  if (scalarKey) return normalizeValue(row[scalarKey]);
  const direct = normalizeValue(row.acquisitionMetrics?.[metricKey]);
  if (direct !== null) return direct;
  for (const alias of LEGACY_METRIC_ALIASES[metricKey] ?? []) {
    const legacy = normalizeValue(row.acquisitionMetrics?.[alias]);
    if (legacy !== null) return legacy;
  }
  return null;
}

export function buildFunnelBlockStages({
  entry,
  row,
  source,
  benchmarks,
}: {
  entry: FunnelBlockCatalogEntry;
  row: MonthlyMetricsRow | null;
  source: FunnelSourceKey | "total";
  benchmarks: Record<string, number | null>;
}): FunnelBlockStage[] {
  let previousVolume: number | null = null;
  return entry.steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((step) => {
      const volume = metricValueForSource(row, step.metricKey, source);
      const currentRate = previousVolume !== null && previousVolume > 0 && volume !== null
        ? Math.min(1, Math.max(0, volume / previousVolume))
        : null;
      const benchmarkRate = funnelBlockBenchmarkFor(benchmarks, entry.blockKey, step.benchmarkKey);
      const isReliable = currentRate !== null && previousVolume !== null && previousVolume >= 30;
      const healthScore = isReliable && benchmarkRate !== null
        ? Math.min(100, Math.round((currentRate / Math.max(benchmarkRate, 0.0001)) * 100))
        : null;
      const stage: FunnelBlockStage = {
        id: `${entry.blockKey}:${step.metricKey}`,
        blockKey: entry.blockKey,
        metricKey: step.metricKey,
        label: step.label,
        unit: step.unit,
        volume,
        currentRate,
        benchmarkRate,
        healthScore,
        isReliable,
      };
      previousVolume = volume;
      return stage;
    });
}

export function hasSourceBreakdown(rows: MonthlyMetricsRow[], source: FunnelSourceKey): boolean {
  return rows.some((row) => Object.values(row.acquisitionSourceMetrics?.[source] ?? {}).some((value) => typeof value === "number"));
}

export function availableFunnelSources(rows: MonthlyMetricsRow[], sources: FunnelSourceKey[]): FunnelSourceKey[] {
  return sources.filter((source) => hasSourceBreakdown(rows, source));
}

export function buildSequenceStages({
  entries,
  row,
  source,
  benchmarks,
}: {
  entries: FunnelBlockCatalogEntry[];
  row: MonthlyMetricsRow | null;
  source: FunnelSourceKey | "total";
  benchmarks: Record<string, number | null>;
}): FunnelBlockStage[] {
  const seen = new Set<string>();
  const stages: FunnelBlockStage[] = [];
  for (const entry of entries) {
    for (const stage of buildFunnelBlockStages({ entry, row, source, benchmarks })) {
      if (seen.has(stage.metricKey)) continue;
      seen.add(stage.metricKey);
      stages.push(stage);
    }
  }
  return stages;
}
