// Shared TanStack Charts styling — every chart in the app reads from here,
// never a hardcoded color/size in a chart component.

export const CHART_COLORS = {
  line: "var(--accent)",
  grid: "var(--border)",
  axisText: "var(--text-secondary)",
  goal: "var(--text-secondary)",
} as const;

// Class applied to the library's tooltip <div> (see globals.css for the
// `!important` overrides this requires — the tooltip extension sets its
// default look via inline styles, which only a stylesheet `!important` can
// beat without forking the extension).
export const CHART_TOOLTIP_CLASS = "scale-chart-tooltip";

const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");
const EUR_FORMAT = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function formatChartEur(value: number): string {
  return EUR_FORMAT.format(value);
}

export function formatChartNumber(value: number): string {
  return NUMBER_FORMAT.format(value);
}
