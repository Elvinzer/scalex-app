"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { defineChart, dot, lineY, ruleY, text as textMark } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { scaleLinear, scalePoint } from "d3-scale";

import {
  CHART_COLORS,
  CHART_TOOLTIP_CLASS,
  formatChartEur,
  formatChartNumber,
} from "@/lib/chart-theme";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion-tokens";
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

// TanStack Charts line chart + segmented metric toggle + optional objective
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
  const reducedMotion = useReducedMotion();

  let lastIndex = -1;
  data.forEach((point, index) => {
    if (point.value !== null) lastIndex = index;
  });
  const lastPoint = lastIndex >= 0 ? data[lastIndex] : null;

  const definition = useMemo(() => {
    return defineChart({
      marks: [
        lineY(data, {
          id: "revenue-line",
          x: "label",
          y: "value",
          stroke: CHART_COLORS.line,
          strokeWidth: 2,
        }),
        // Objective reference line (CA only) — dashed, muted, no label mark:
        // the toggle bar above already names the metric, and a raw dashed
        // line reads as "target" without extra clutter.
        ...(isMoney && goalValue !== null
          ? [
              ruleY([goalValue] as const, {
                id: "revenue-goal",
                strokeDasharray: "4 4",
                strokeOpacity: 0.6,
              }),
            ]
          : []),
        // Silent everywhere except the last point with real data, where it
        // draws a filled dot + a floating value label above it — matches
        // the reference's "22 549 €" callout on the most recent point.
        ...(lastPoint
          ? [
              dot([lastPoint], {
                id: "revenue-last-dot",
                x: "label",
                y: "value",
                r: 4,
                fill: CHART_COLORS.line,
                stroke: "var(--surface)",
                strokeWidth: 2,
              }),
              textMark([lastPoint], {
                id: "revenue-last-label",
                x: "label",
                y: "value",
                text: (point: ChartPoint) => format(point.value ?? 0),
                dy: -14,
                fontSize: 12,
                fontWeight: 700,
                fill: "var(--foreground)",
              }),
            ]
          : []),
      ],
      x: {
        // Point scale: evenly-spaced categorical positions for month labels.
        // Must be the bare factory reference (not a called/configured
        // instance) — TanStack Charts only auto-infers a scale's domain
        // from the mark's data when given an uninvoked factory; a
        // pre-configured instance is assumed to already carry its domain
        // and is used as-is, which would leave this one empty (every
        // point mapping to NaN). Domain ends up as every row's `label`,
        // including months with a null value — same x ticks recharts drew.
        scale: scalePoint,
        axis: { line: false, ticks: { size: 0 } },
      },
      y: {
        scale: scaleLinear,
        nice: 5,
        grid: true,
        axis: { line: false, ticks: { size: 0, count: 5, format } },
      },
      theme: {
        grid: CHART_COLORS.grid,
        foreground: CHART_COLORS.goal,
        muted: CHART_COLORS.axisText,
      },
      tooltip: {
        use: tooltip,
        className: CHART_TOOLTIP_CLASS,
        items: [
          {
            channel: "y",
            label: METRIC_CHART_TITLE[selectedMetric],
            text: (point) => (point.yValue === null || point.yValue === undefined ? "—" : format(point.yValue as number)),
          },
          { channel: "x", label: "Mois" },
        ],
      },
      // A month with no data must show as a real gap, never an invented
      // interpolation — lineY breaks its segment on a null/undefined y by
      // default, so no extra config is needed here (recharts' `connectNulls`
      // default equivalent).
      animate: { duration: 420, easing: "ease-out" },
    });
  }, [data, isMoney, goalValue, lastPoint, format, selectedMetric]);

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

      <motion.div
        key={selectedMetric}
        initial={reducedMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION_DURATION.base, ease: MOTION_EASE.out }}
      >
        <Chart
          definition={definition}
          height={280}
          initialWidth={760}
          ariaLabel={`${METRIC_CHART_TITLE[selectedMetric]} — évolution mensuelle`}
        />
      </motion.div>
    </div>
  );
}
