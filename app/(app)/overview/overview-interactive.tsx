"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { Sparkline } from "@/components/sparkline";
import { trackClient } from "@/lib/analytics-client";
import type { MetricCard as MetricCardData } from "@/lib/dashboard/metrics";
import { cn } from "@/lib/utils";

import { OverviewRevenueChart, type ChartPoint, type OverviewMetricOption } from "@/components/overview-revenue-chart";

// Which chart series a given metric card should select/scroll to — "closing-rate"
// and "average-sale" have no exact 1:1 chart series (the chart only has
// CA/Leads/RDV/Ventes counts), so both point at "ventes" as the closest
// related series rather than not being clickable at all.
const CARD_TO_METRIC: Record<string, OverviewMetricOption> = {
  revenue: "ca",
  leads: "leads",
  "closing-rate": "ventes",
  "average-sale": "ventes",
};

function OverviewMetricCard({ data, onSelect }: { data: MetricCardData; onSelect: () => void }) {
  if (data.status === "missing") {
    return (
      <Link href={data.href} className="sticker-card-dashed flex flex-col p-4">
        <p className="text-xs font-bold text-muted-foreground">{data.label}</p>
        <p className="mt-2 text-sm font-bold text-muted-foreground/80">Donnée manquante</p>
        <p className="mt-1 text-xs font-bold text-muted-foreground/70">{data.reason}</p>
        <span className="mt-auto pt-3 text-sm font-bold text-accent">{data.ctaLabel} →</span>
      </Link>
    );
  }

  return (
    <button type="button" onClick={onSelect} className="sticker-card flex w-full flex-col p-4 text-left hover:border-border-hover">
      <p className="text-xs font-bold text-muted-foreground">{data.label}</p>
      <p className="mt-1.5 text-xl font-bold tracking-[-0.01em] tabular-nums">{data.valueLabel}</p>
      <div className="mt-1 min-h-4">
        {data.deltaLabel && (
          <p
            className={cn(
              "flex items-center gap-1 text-xs font-bold",
              data.deltaDirection === "up" && "text-state-healthy",
              data.deltaDirection === "down" && "text-state-critical",
              data.deltaDirection === null && "text-muted-foreground"
            )}
          >
            {data.deltaDirection === "up" && <ArrowUp className="size-3" />}
            {data.deltaDirection === "down" && <ArrowDown className="size-3" />}
            {data.deltaLabel}
          </p>
        )}
      </div>
      <div className="mt-auto pt-3">
        <Sparkline values={data.sparklineValues} labels={data.sparklineLabels} color="var(--accent)" height={36} />
      </div>
    </button>
  );
}

export function OverviewInteractive({
  metricCards,
  chartSeries,
  goalValue,
}: {
  metricCards: MetricCardData[];
  chartSeries: Record<OverviewMetricOption, ChartPoint[]>;
  goalValue: number | null;
}) {
  const [selectedMetric, setSelectedMetric] = useState<OverviewMetricOption>("ca");
  const chartRef = useRef<HTMLDivElement>(null);

  function handleSelect(metric: OverviewMetricOption) {
    setSelectedMetric(metric);
    trackClient("overview_metric_switched", { metric });
    chartRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {metricCards.map((card) => (
          <OverviewMetricCard
            key={card.key}
            data={card}
            onSelect={() => handleSelect(CARD_TO_METRIC[card.key] ?? "ca")}
          />
        ))}
      </div>

      <div ref={chartRef} className="sticker-card p-6">
        <OverviewRevenueChart
          series={chartSeries}
          selectedMetric={selectedMetric}
          onSelectMetric={handleSelect}
          goalValue={goalValue}
        />
      </div>
    </>
  );
}
