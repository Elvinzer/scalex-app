import type { CSSProperties } from "react";

// Shared Recharts styling — every chart on /overview reads from here, never
// a hardcoded color/size in a chart component. No dependency on "@/db" or
// anything server-only: safe to import from client chart components.

export const CHART_COLORS = {
  line: "var(--accent)",
  area: "rgba(232, 102, 60, 0.08)",
  grid: "var(--border)",
  axisText: "var(--text-secondary)",
  goal: "var(--text-secondary)",
} as const;

// CartesianGrid props — horizontal lines only, no verticals.
export const chartGridProps = {
  horizontal: true,
  vertical: false,
  stroke: CHART_COLORS.grid,
} as const;

// Shared XAxis/YAxis props — no axis line, small muted ticks.
export const chartAxisProps = {
  axisLine: false,
  tickLine: false,
  tick: { fontSize: 11, fill: CHART_COLORS.axisText },
} as const;

// <Tooltip contentStyle={chartTooltipStyle} />
export const chartTooltipStyle: CSSProperties = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  boxShadow: "var(--shadow-float)",
  fontSize: 13,
  padding: "8px 12px",
};

export const chartLineProps = {
  stroke: CHART_COLORS.line,
  strokeWidth: 2,
  dot: false,
  activeDot: { r: 4 },
} as const;

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");
const EUR_FORMAT = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function formatChartEur(value: number): string {
  return EUR_FORMAT.format(value);
}

export function formatChartNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}
