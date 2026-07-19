import { eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { benchmarks } from "@/db/schema";
import { inRange } from "@/lib/dashboard/metrics";
import type { SectorKey } from "@/lib/benchmarks";
import { rate } from "@/lib/setting/funnel";
import type { TestimonialRow } from "@/lib/testimonials/types";

import { computeMetricStatus, type MetricStatus } from "./cascade";
import type { MonthWindow } from "./completed-months";

// Testimonials collected / sales closed — a mini metric like
// lib/diagnostic/content-metrics.ts's pair, not part of the 5-stage sales
// cascade.
export async function getTestimonialBenchmark(sector: SectorKey | null): Promise<number> {
  const sectorRow = sector
    ? (await db.select().from(benchmarks).where(eq(benchmarks.sector, sector))).find(
        (row) => row.metricKey === "testimonial_rate"
      )
    : undefined;
  const globalRow = (await db.select().from(benchmarks).where(isNull(benchmarks.sector))).find(
    (row) => row.metricKey === "testimonial_rate"
  );
  return sectorRow?.value ?? globalRow?.value ?? 0;
}

export function aggregateTestimonialCount(months: MonthWindow[], allTestimonials: TestimonialRow[]): number {
  return allTestimonials.filter((testimonial) => months.some(({ range }) => inRange(testimonial.collectedAt, range)))
    .length;
}

export type TestimonialSummary = {
  key: "testimonial_rate";
  category: "Délivrabilité";
  label: string;
  status: MetricStatus;
  currentRatePercent: number | null;
  benchmarkRatePercent: number;
};

export function computeTestimonialSummary({
  count,
  salesClosed,
  benchmark,
}: {
  count: number;
  salesClosed: number;
  benchmark: number;
}): TestimonialSummary {
  const current = rate(count, salesClosed);
  const status = computeMetricStatus(current, benchmark, salesClosed);

  return {
    key: "testimonial_rate",
    category: "Délivrabilité",
    label: "Taux de collecte de témoignages",
    status,
    currentRatePercent: current === null ? null : Math.round(current * 100),
    benchmarkRatePercent: Math.round(benchmark * 100),
  };
}
