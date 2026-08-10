"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { OverviewRevenueChart, type ChartPoint, type OverviewMetricOption } from "@/components/overview-revenue-chart";
import { trackClient } from "@/lib/analytics-client";

const TREND_OPTIONS: { value: string; label: string }[] = [
  { value: "3", label: "trend3" },
  { value: "6", label: "trend6" },
  { value: "12", label: "trend12" },
  { value: "year", label: "trendYear" },
];

// Moved from the old /overview page (removed — this chart was the one thing
// there that wasn't already duplicated on Dashboard or Diagnostic). Lives
// here, not on Diagnostic, so it doesn't compete with Diagnostic's own
// "period" selector (3-months/current-month/12-months), which drives a
// different calculation (the cascade points) — a second, differently-scoped
// period control on that page would just recreate the confusion this whole
// cleanup is meant to remove. `trendPeriod` is a separate query param from
// this page's own `year` (the entry-grid navigation), so the two controls
// never collide.
export function RevenueTrend({
  year,
  trendPeriod,
  chartSeries,
  goalValue,
}: {
  year: number;
  trendPeriod: string;
  chartSeries: Record<OverviewMetricOption, ChartPoint[]>;
  goalValue: number | null;
}) {
  const t = useTranslations("data");
  const router = useRouter();
  const [selectedMetric, setSelectedMetric] = useState<OverviewMetricOption>("ca");

  function handleSelectMetric(metric: OverviewMetricOption) {
    setSelectedMetric(metric);
    trackClient("datas_trend_metric_switched", { metric });
  }

  return (
    <div className="sticker-card p-6">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{t("trend")}</p>
        <select
          value={trendPeriod}
          onChange={(event) => router.push(`/datas?year=${year}&trendPeriod=${event.target.value}`)}
          className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm font-bold outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
        >
          {TREND_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(option.label)}
            </option>
          ))}
        </select>
      </div>
      <OverviewRevenueChart series={chartSeries} selectedMetric={selectedMetric} onSelectMetric={handleSelectMetric} goalValue={goalValue} />
    </div>
  );
}
