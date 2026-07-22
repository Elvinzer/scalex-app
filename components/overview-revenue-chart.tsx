"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  chartAxisProps,
  chartGridProps,
  chartLineProps,
  chartTooltipStyle,
  formatChartEur,
  formatChartNumber,
} from "@/lib/chart-theme";
import { cn } from "@/lib/utils";

export type OverviewMetricOption = "ca" | "leads" | "rdv" | "ventes";

export const METRIC_TOGGLE_LABELS: Record<OverviewMetricOption, string> = {
  ca: "CA",
  leads: "Leads",
  rdv: "RDV",
  ventes: "Ventes",
};

const METRIC_CHART_TITLE: Record<OverviewMetricOption, string> = {
  ca: "CA encaissé",
  leads: "Leads générés",
  rdv: "RDV réservés",
  ventes: "Ventes conclues",
};

export type ChartPoint = { label: string; value: number | null };

// Custom dot: silent everywhere except the last point with real data, where
// it draws a filled dot + a floating value label above it — matches the
// reference's "22 549 €" callout on the most recent point.
function LastPointDot(lastIndex: number, format: (value: number) => string) {
  return function Dot(props: { cx?: number; cy?: number; index?: number; value?: number | null }) {
    const { cx, cy, index, value } = props;
    if (index !== lastIndex || cx === undefined || cy === undefined || value === null || value === undefined) {
      return <g />;
    }
    return (
      <g>
        <circle cx={cx} cy={cy} r={4} fill="var(--accent)" stroke="white" strokeWidth={2} />
        <text x={cx} y={cy - 14} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--foreground)">
          {format(value)}
        </text>
      </g>
    );
  };
}

// Recharts line chart + segmented metric toggle + optional objective
// reference line (business_profile.identity.mrrGoal) — CA only. Controlled
// component: selection state lives in the parent (overview-interactive.tsx)
// since clicking a Bloc 1 metric card must drive the same selection.
export function OverviewRevenueChart({
  series,
  selectedMetric,
  onSelectMetric,
  goalValue,
}: {
  series: Record<OverviewMetricOption, ChartPoint[]>;
  selectedMetric: OverviewMetricOption;
  onSelectMetric: (metric: OverviewMetricOption) => void;
  goalValue: number | null;
}) {
  const data = series[selectedMetric];
  const isMoney = selectedMetric === "ca";
  const format = isMoney ? formatChartEur : formatChartNumber;

  let lastIndex = -1;
  data.forEach((point, index) => {
    if (point.value !== null) lastIndex = index;
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-bold">{METRIC_CHART_TITLE[selectedMetric]}</p>
        <div className="flex gap-1 rounded-full border border-border p-1">
          {(Object.keys(METRIC_TOGGLE_LABELS) as OverviewMetricOption[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelectMetric(key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-bold transition-colors",
                // Soft tint for the selected toggle, not a solid coral fill —
                // coral stays reserved for the page's one priority CTA.
                key === selectedMetric ? "bg-accent-soft text-accent-text" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {METRIC_TOGGLE_LABELS[key]}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 28, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid {...chartGridProps} />
          <XAxis dataKey="label" {...chartAxisProps} />
          <YAxis {...chartAxisProps} width={64} tickFormatter={(value: number) => format(value)} />
          <Tooltip
            contentStyle={chartTooltipStyle}
            formatter={(value) => (typeof value === "number" ? format(value) : "—")}
          />
          {isMoney && goalValue !== null && (
            <ReferenceLine
              y={goalValue}
              stroke="var(--text-secondary)"
              strokeDasharray="4 4"
              label={{ value: "Objectif", position: "insideTopRight", fontSize: 11, fill: "var(--text-secondary)" }}
            />
          )}
          {/* connectNulls left at its default (false) — a month with no data
              must show as a real gap, never an invented interpolation. */}
          <Line type="monotone" dataKey="value" {...chartLineProps} dot={LastPointDot(lastIndex, format)} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
