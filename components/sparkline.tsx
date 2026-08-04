"use client";

import { motion } from "motion/react";

import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion-tokens";

// Draws in once on mount (pathLength 0 → 1), skipped under
// prefers-reduced-motion. A stat-tile sparkline is small and low-stakes
// enough that this is the one "use client" cost paid across the whole
// MetricCard grid — worth it for the same first-impression reveal every
// other chart in the app now gets via `motion`.
export function Sparkline({
  values,
  labels,
  color = "var(--text-secondary)",
  height = 40,
  width = 160,
  domain,
}: {
  values: number[];
  labels: string[];
  // All optional — defaults match the original behavior exactly, so
  // existing callers (MetricCard/Dashboard) are unaffected.
  color?: string;
  height?: number;
  width?: number;
  // Fixed [min, max] instead of auto-scaling to this series' own range —
  // for values with a meaningful absolute scale (e.g. a 0-100 score),
  // where zooming into the visible window's min/max would misrepresent
  // "where on the full scale" the series actually sits.
  domain?: [number, number];
}) {
  const reducedMotion = useReducedMotion();

  if (values.length < 2) {
    return <div className="w-full" style={{ height }} aria-hidden="true" />;
  }

  const max = domain?.[1] ?? Math.max(...values, 1);
  const min = domain?.[0] ?? Math.min(...values, 0);
  const range = max - min || 1;

  const points = values.map((value, index) => ({
    x: (index / (values.length - 1)) * width,
    y: height - ((value - min) / range) * (height - 6) - 3,
    value,
    label: labels[index],
  }));

  const linePath = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="w-full overflow-visible"
      style={{ height }}
      role="img"
      aria-label={`Évolution sur les ${values.length} derniers jours`}
    >
      <motion.polyline
        points={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reducedMotion ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: MOTION_DURATION.slow, ease: MOTION_EASE.out }}
      />
      {points.map((point, index) => (
        <circle key={index} cx={point.x} cy={point.y} r={5} fill="transparent">
          <title>{`${point.label} — ${point.value}`}</title>
        </circle>
      ))}
    </svg>
  );
}
