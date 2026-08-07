"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { defineChart, dot, lineY, text as textMark } from "@tanstack/charts";
import { tooltip } from "@tanstack/charts/tooltip";
import { Chart } from "@tanstack/react-charts";
import { scaleLinear, scalePoint } from "d3-scale";

import { CHART_COLORS, CHART_TOOLTIP_CLASS } from "@/lib/chart-theme";
import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion-tokens";

import type { StripeTrendPoint } from "@/lib/stripe/transaction-insights";

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `${Math.round(cents / 100).toLocaleString("fr-FR")} ${currency.toUpperCase()}`;
  }
}

export function StripeTrendChart({ data, currency }: { data: StripeTrendPoint[]; currency: string }) {
  const reducedMotion = useReducedMotion();
  const lastPoint = data.at(-1) ?? null;

  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          lineY(data, {
            id: "stripe-net-line",
            x: "label",
            y: "netCents",
            stroke: CHART_COLORS.line,
            strokeWidth: 2,
          }),
          ...(lastPoint
            ? [
                dot([lastPoint], {
                  id: "stripe-net-last-dot",
                  x: "label",
                  y: "netCents",
                  r: 4,
                  fill: CHART_COLORS.line,
                  stroke: "var(--surface)",
                  strokeWidth: 2,
                }),
                textMark([lastPoint], {
                  id: "stripe-net-last-label",
                  x: "label",
                  y: "netCents",
                  text: (point: StripeTrendPoint) => formatMoney(point.netCents, currency),
                  dy: -14,
                  fontSize: 12,
                  fontWeight: 700,
                  fill: "var(--foreground)",
                }),
              ]
            : []),
        ],
        x: { scale: scalePoint, axis: { line: false, ticks: { size: 0 } } },
        y: {
          scale: scaleLinear,
          nice: 5,
          grid: true,
          axis: {
            line: false,
            ticks: { size: 0, count: 5, format: (value: number) => formatMoney(value, currency) },
          },
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
              label: "CA net",
              text: (point) => (point.yValue === null || point.yValue === undefined ? "—" : formatMoney(point.yValue, currency)),
            },
            { channel: "x", label: "Mois" },
          ],
        },
        animate: reducedMotion ? false : { duration: 420, easing: "ease-out" },
      }),
    [currency, data, lastPoint, reducedMotion],
  );

  if (data.length === 0) {
    return (
      <div className="flex min-h-56 items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border bg-surface-sunken px-4 text-center text-sm text-muted-foreground">
        Pas assez de données pour tracer une tendance sur cette période.
      </div>
    );
  }

  const first = data[0];
  const last = data[data.length - 1];
  const direction = last.netCents - first.netCents;
  const summary = `Tendance du CA net de ${first.label} à ${last.label} : ${formatMoney(first.netCents, currency)} puis ${formatMoney(last.netCents, currency)}. ${direction > 0 ? "La dernière valeur est en hausse." : direction < 0 ? "La dernière valeur est en baisse." : "La dernière valeur est stable."}`;

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground" id="stripe-trend-summary">
        {summary}
      </p>
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: MOTION_DURATION.base, ease: MOTION_EASE.out }}
      >
        <Chart
          definition={definition}
          height={250}
          initialWidth={720}
          ariaLabel={`Évolution du CA net en ${currency.toUpperCase()}`}
        />
      </motion.div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs font-bold text-muted-foreground" role="group" aria-label="Légende du graphique">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-accent" aria-hidden="true" />
          CA net
        </span>
        <span>{data.reduce((sum, point) => sum + point.transactionCount, 0)} transactions réussies</span>
      </div>
    </div>
  );
}
