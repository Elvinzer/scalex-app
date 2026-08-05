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
//
// content_booking_rate/content_close_rate are a second, views-denominated
// mini-funnel bolted onto the same family: views -> RDV bookés -> RDV
// closés, from content_posts.bookings/dealsClosed (manual entry, see
// db/schema.ts's contentPosts comment) — deliberately NOT denominated by
// clicks like content_lead_rate above, since clicks is always null/0 for
// every synced (Instagram/YouTube) row (no organic click API exists), which
// would make content_lead_rate's own pattern permanently "unmeasured" here.
// Works across BOTH platforms uniformly (content_posts is platform-shared)
// even though only YouTube has a manual-entry UI today (see
// app/(app)/acquisition/contenu/actions.ts) — an Instagram row's
// bookings/dealsClosed simply stay null until it gets one too.
export type ContentMetricKey = "content_click_rate" | "content_lead_rate" | "content_booking_rate" | "content_close_rate";

export const CONTENT_METRIC_KEYS: ContentMetricKey[] = [
  "content_click_rate",
  "content_lead_rate",
  "content_booking_rate",
  "content_close_rate",
];

const CONTENT_METRIC_LABELS: Record<ContentMetricKey, string> = {
  content_click_rate: "Taux de clic sur le contenu",
  content_lead_rate: "Taux de conversion clic → lead",
  content_booking_rate: "Taux de RDV bookés depuis le contenu",
  content_close_rate: "Taux de closing des RDV issus du contenu",
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

export type ContentTotals = { views: number; clicks: number; leads: number; bookings: number; dealsClosed: number };

export function aggregateContentTotals(months: MonthWindow[], allPosts: ContentPostRow[]): ContentTotals {
  const inWindow = allPosts.filter((post) => months.some(({ range }) => inRange(post.publishedAt, range)));

  return inWindow.reduce(
    (sum, post) => ({
      views: sum.views + post.views,
      clicks: sum.clicks + (post.clicks ?? 0),
      leads: sum.leads + (post.leads ?? 0),
      bookings: sum.bookings + (post.bookings ?? 0),
      dealsClosed: sum.dealsClosed + (post.dealsClosed ?? 0),
    }),
    { views: 0, clicks: 0, leads: 0, bookings: 0, dealsClosed: 0 }
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
  const bookingRate = rate(totals.bookings, totals.views);
  const closeRate = rate(totals.dealsClosed, totals.bookings);
  const rates: Record<ContentMetricKey, number | null> = {
    content_click_rate: clickRate,
    content_lead_rate: leadRate,
    content_booking_rate: bookingRate,
    content_close_rate: closeRate,
  };
  const volumes: Record<ContentMetricKey, number> = {
    content_click_rate: totals.views,
    content_lead_rate: totals.clicks,
    content_booking_rate: totals.views,
    content_close_rate: totals.bookings,
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
