import type { ClosingTotals } from "@/lib/closing/metrics";
import type { ContentTotals } from "@/lib/diagnostic/content-metrics";
import type { AcquisitionSourceTotals } from "@/lib/diagnostic/acquisition-sources";
import type { BottleneckFunnelVariant, BottleneckStage } from "@/lib/dashboard/bottleneck";
import type { FunnelTotals } from "@/lib/setting/funnel";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";

import type { FunnelBlockCatalogEntry, FunnelBlockSelection, FunnelSourceKey } from "./types";

type FunnelBlockMetricValuesInput = {
  row: MonthlyMetricsRow | null;
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  contentTotals: ContentTotals;
  acquisitionTotals: AcquisitionSourceTotals;
  hasSettingData: boolean;
  hasClosingData: boolean;
};

type BuildFunnelBlockBottleneckInput = {
  selection: FunnelBlockSelection;
  catalog: FunnelBlockCatalogEntry[];
  row: MonthlyMetricsRow | null;
  benchmarks: Record<string, number | null>;
  metricValues: Record<string, number | null>;
  source: FunnelSourceKey | "total";
  dealPrice: number | null;
  revenue: number | null;
  sales: number | null;
  catalogLabel: string;
};

function finiteNonNegative(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function metricValue(
  row: MonthlyMetricsRow | null,
  metricValues: Record<string, number | null>,
  metricKey: string,
  source: FunnelSourceKey | "total"
): number | null {
  if (source !== "total") {
    return finiteNonNegative(row?.acquisitionSourceMetrics?.[source]?.[metricKey]);
  }
  if (Object.prototype.hasOwnProperty.call(metricValues, metricKey)) {
    return finiteNonNegative(metricValues[metricKey]);
  }
  return finiteNonNegative(row?.acquisitionMetrics?.[metricKey]);
}

function sourceForMetric(metricKey: string): BottleneckStage["source"] {
  if (metricKey.includes("content")) return "content";
  if (metricKey.includes("calls") || metricKey.includes("booking") || metricKey.includes("conversation")) return "calls";
  if (metricKey.includes("sales")) return "sales";
  return "manual";
}

function sourceHrefForMetric(metricKey: string, blockKey: string): string {
  if (metricKey.includes("email")) return "/acquisition/mail";
  if (metricKey.includes("content") || metricKey.includes("lead_magnet")) return "/acquisition/contenu";
  if (metricKey.includes("calls") || metricKey.includes("booking") || metricKey.includes("conversation")) return "/ventes/appels/funnel";
  if (metricKey.includes("sales")) return "/ventes/suivi";
  return `/acquisition/${blockKey.replaceAll("_", "-")}`;
}

function projectFinalVolume(stages: BottleneckStage[], overrideIndex: number | null, useBenchmarks: boolean): number | null {
  const firstVolume = stages[0]?.volume ?? null;
  if (firstVolume === null) return null;

  let projected = firstVolume;
  for (let index = 1; index < stages.length; index += 1) {
    const stage = stages[index];
    const rate = useBenchmarks || overrideIndex === index ? stage.benchmarkRate : stage.currentRate;
    if (rate === null) return null;
    projected *= rate;
  }
  return projected;
}

function normalizedEntries(selection: FunnelBlockSelection, catalog: FunnelBlockCatalogEntry[]): FunnelBlockCatalogEntry[] {
  const byKey = new Map(catalog.map((entry) => [entry.blockKey, entry]));
  return selection.blocks
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((item) => byKey.get(item.blockKey))
    .filter((entry): entry is FunnelBlockCatalogEntry => entry !== undefined && entry.family !== "source");
}

export function buildFunnelBlockMetricValues({
  row,
  settingTotals,
  closingTotals,
  contentTotals,
  acquisitionTotals,
  hasSettingData,
  hasClosingData,
}: FunnelBlockMetricValuesInput): Record<string, number | null> {
  const values: Record<string, number | null> = { ...(row?.acquisitionMetrics ?? {}) };
  const set = (key: string, value: number | null, enabled = true) => {
    if (enabled && value !== null && Number.isFinite(value) && value >= 0) values[key] = value;
  };

  set("new_followers", settingTotals.newSubscribers, hasSettingData);
  set("first_messages", settingTotals.firstMessagesSent, hasSettingData);
  set("conversations", settingTotals.conversationsStarted, hasSettingData);
  set("calls_proposed", settingTotals.callsProposed, hasSettingData);
  set("calls_booked", settingTotals.callsBooked, hasSettingData);
  set("calls_attended", closingTotals.callsAttended, hasClosingData);
  set("sales_closed", closingTotals.salesClosed, hasClosingData);

  // Connected content is authoritative for these two acquisition metrics only
  // when at least one post declared the corresponding value. A synced view
  // without click/lead annotations must remain unmeasured, not zero.
  set("lead_magnet_clicks", contentTotals.clicks, contentTotals.samples.content_click_rate.posts > 0);
  set("lead_magnet_optins", contentTotals.leads, contentTotals.samples.content_lead_rate.posts > 0);
  set("event_registrants", acquisitionTotals.meta.registrations, acquisitionTotals.meta.registrations > 0);
  set("email_sends", acquisitionTotals.email.sends, acquisitionTotals.email.sends > 0);
  set("email_opens", acquisitionTotals.email.opens, acquisitionTotals.email.sends > 0);
  set("email_clicks", acquisitionTotals.email.clicks, acquisitionTotals.email.sends > 0);

  // A source breakdown is also a valid total when an older write stored only
  // the per-source values. Fill only missing totals so an explicit total or a
  // connected integration keeps precedence.
  const sourceSums = new Map<string, number>();
  for (const sourceMetrics of Object.values(row?.acquisitionSourceMetrics ?? {})) {
    for (const [metricKey, value] of Object.entries(sourceMetrics)) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
      sourceSums.set(metricKey, (sourceSums.get(metricKey) ?? 0) + value);
    }
  }
  for (const [metricKey, sourceTotal] of sourceSums) {
    if (!Object.prototype.hasOwnProperty.call(values, metricKey) || values[metricKey] === null) {
      values[metricKey] = sourceTotal;
    }
  }

  return values;
}

export function buildFunnelBlockBottleneck({
  selection,
  catalog,
  row,
  benchmarks,
  metricValues,
  source,
  dealPrice,
  revenue,
  sales,
  catalogLabel,
}: BuildFunnelBlockBottleneckInput): BottleneckFunnelVariant {
  const entries = normalizedEntries(selection, catalog);
  const stages: BottleneckStage[] = [];
  let previousVolume: number | null = null;

  for (const entry of entries) {
    for (const step of entry.steps.slice().sort((a, b) => a.order - b.order)) {
      const volume = metricValue(row, metricValues, step.metricKey, source);
      const currentRate = previousVolume !== null && previousVolume > 0 && volume !== null
        ? Math.min(1, Math.max(0, volume / previousVolume))
        : null;
      const benchmarkRate = step.benchmarkKey === null
        ? null
        : finiteNonNegative(benchmarks[`${entry.blockKey}:${step.benchmarkKey}`]);
      const isReliable = currentRate !== null && previousVolume !== null && previousVolume >= 30;

      stages.push({
        id: `${entry.blockKey}:${step.metricKey}`,
        volume,
        currentRate,
        benchmarkRate,
        monthlyGain: null,
        metricKey: step.metricKey,
        isReliable,
        noteKey: benchmarkRate !== null && currentRate === null ? "sourceIncomplete" : null,
        source: sourceForMetric(step.metricKey),
        label: step.label,
        unit: step.unit,
        sourceHref: sourceHrefForMetric(step.metricKey, entry.blockKey),
      });
      previousVolume = volume;
    }
  }

  const finalVolume = stages.at(-1)?.volume ?? null;
  const price = typeof dealPrice === "number" && Number.isFinite(dealPrice) && dealPrice > 0 ? dealPrice : null;
  const baselineValue = finalVolume !== null && price !== null ? Math.round(finalVolume * price) : null;
  const currentFinalVolume = projectFinalVolume(stages, null, false) ?? finalVolume;

  stages.forEach((stage, index) => {
    if (stage.benchmarkRate === null || stage.currentRate === null) return;
    if (stage.currentRate >= stage.benchmarkRate) {
      stage.monthlyGain = 0;
      stage.isReliable = true;
      stage.noteKey = null;
      return;
    }
    if (!stage.isReliable) {
      stage.noteKey = "volumeInsufficient";
      return;
    }
    if (price === null || currentFinalVolume === null) {
      stage.noteKey = "gainUnavailable";
      return;
    }
    const projectedFinal = projectFinalVolume(stages, index, false);
    if (projectedFinal === null) {
      stage.noteKey = "sourceIncomplete";
      return;
    }
    const theoreticalGain = Math.round(Math.max(0, projectedFinal - currentFinalVolume) * price);
    stage.monthlyGain = baselineValue === null ? theoreticalGain : Math.min(theoreticalGain, baselineValue);
    stage.noteKey = null;
  });

  const topStage = stages.reduce<BottleneckStage | null>((top, stage) => {
    if (stage.monthlyGain === null || stage.monthlyGain <= 0) return top;
    return !top || stage.monthlyGain > (top.monthlyGain ?? 0) ? stage : top;
  }, null);
  const knownGains = stages
    .map((stage) => stage.monthlyGain)
    .filter((gain): gain is number => gain !== null);

  return {
    catalogKey: "assembled",
    catalogLabel,
    stages,
    bottleneckId: topStage?.id ?? null,
    totalPotential: knownGains.length > 0 ? knownGains.reduce((sum, gain) => sum + gain, 0) : null,
    sales: sales ?? (stages.find((stage) => stage.metricKey === "sales_closed")?.volume ?? null),
    revenue,
  };
}
