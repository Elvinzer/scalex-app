import { eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { benchmarks } from "@/db/schema";
import { inRange } from "@/lib/dashboard/metrics";
import type { SectorKey } from "@/lib/benchmarks";
import type { ContentPostRow } from "@/lib/content-posts/types";
import { rate } from "@/lib/setting/funnel";

import { computeMetricStatus, type MetricStatus } from "./cascade";
import type { MonthWindow } from "./completed-months";

// The content mini-funnel (views -> clicks -> leads) — deliberately
// separate from lib/diagnostic/cascade.ts's 5-stage messages->sales
// cascade (see db/schema.ts's diagnosticMetricEnum comment): no €/client
// simulation is attached, since there's no cascade linking a view to a
// final sale yet.
export type ContentMetricKey = "content_click_rate" | "content_lead_rate";

export const CONTENT_METRIC_KEYS: ContentMetricKey[] = ["content_click_rate", "content_lead_rate"];

const CONTENT_METRIC_LABELS: Record<ContentMetricKey, string> = {
  content_click_rate: "Taux de clic sur le contenu",
  content_lead_rate: "Taux de conversion clic → lead",
};

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

export type ContentTotals = { views: number; clicks: number; leads: number };

export function aggregateContentTotals(months: MonthWindow[], allPosts: ContentPostRow[]): ContentTotals {
  const inWindow = allPosts.filter((post) => months.some(({ range }) => inRange(post.publishedAt, range)));

  return inWindow.reduce(
    (sum, post) => ({
      views: sum.views + post.views,
      clicks: sum.clicks + (post.clicks ?? 0),
      leads: sum.leads + (post.leads ?? 0),
    }),
    { views: 0, clicks: 0, leads: 0 }
  );
}

export type ContentMetricSummary = {
  key: ContentMetricKey;
  category: "Contenu";
  label: string;
  status: MetricStatus;
  currentRatePercent: number | null;
  benchmarkRatePercent: number;
};

export function computeContentMetricSummaries({
  totals,
  benchmarks: contentBenchmarks,
}: {
  totals: ContentTotals;
  benchmarks: Record<ContentMetricKey, number>;
}): ContentMetricSummary[] {
  const clickRate = rate(totals.clicks, totals.views);
  const leadRate = rate(totals.leads, totals.clicks);
  const rates: Record<ContentMetricKey, number | null> = {
    content_click_rate: clickRate,
    content_lead_rate: leadRate,
  };
  const volumes: Record<ContentMetricKey, number> = {
    content_click_rate: totals.views,
    content_lead_rate: totals.clicks,
  };

  return CONTENT_METRIC_KEYS.map((key) => {
    const current = rates[key];
    const benchmark = contentBenchmarks[key];
    const status = computeMetricStatus(current, benchmark, volumes[key]);

    return {
      key,
      category: "Contenu" as const,
      label: CONTENT_METRIC_LABELS[key],
      status,
      currentRatePercent: current === null ? null : Math.round(current * 100),
      benchmarkRatePercent: Math.round(benchmark * 100),
    };
  });
}
