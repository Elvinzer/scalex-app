"use client";

import { ArrowDown } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";

import { useReducedMotion } from "@/lib/hooks/use-reduced-motion";
import { MOTION_DURATION, MOTION_EASE } from "@/lib/motion-tokens";
import { cn } from "@/lib/utils";
import { formatPercent, type FunnelRates, type FunnelStage, type FunnelTotals } from "@/lib/setting/funnel";

const STAGES: { key: keyof FunnelTotals; labelKey: string }[] = [
  { key: "newSubscribers", labelKey: "newSubscribers" },
  { key: "firstMessagesSent", labelKey: "firstMessages" },
  { key: "conversationsStarted", labelKey: "conversations" },
  { key: "callsProposed", labelKey: "callsProposed" },
  { key: "callsBooked", labelKey: "callsBooked" },
];

// Order matches the transition each rate measures: newSubscribers →
// firstMessagesSent is outreachRate, and so on down the funnel.
const CONNECTOR_RATES: FunnelStage[] = [
  "outreachRate",
  "responseRate",
  "proposalRate",
  "bookingRate",
];

// One hue (--signal) because these five bars are stages of a single flow,
// not independent categories to compare; length is the only encoding that
// matters here, per the dataviz magnitude rule. Bars grow in on mount with
// a light stagger — one cohesive chart animating as a unit, not five
// independent decorative elements.
export function FunnelChart({
  totals,
  rates,
  bottleneckStage,
}: {
  totals: FunnelTotals;
  rates: FunnelRates;
  bottleneckStage: FunnelStage | null;
}) {
  const locale = useLocale();
  const t = useTranslations("pipeline.funnel");
  const reducedMotion = useReducedMotion();
  const maxValue = Math.max(totals.newSubscribers, totals.firstMessagesSent, 1);

  return (
    <div className="flex flex-col gap-3">
      {STAGES.map((stage, index) => {
        const value = totals[stage.key];
        const widthPercent = Math.max((value / maxValue) * 100, value > 0 ? 4 : 1.5);
        const connectorRate = index > 0 ? CONNECTOR_RATES[index - 1] : null;
        const connectorValue = connectorRate ? rates[connectorRate] : null;
        const isBottleneckConnector = connectorRate === bottleneckStage;

        return (
          <div key={stage.key} className="flex flex-col gap-1.5">
            {connectorRate && (
              <div className="flex items-center gap-2 py-0.5 pl-1">
                <ArrowDown
                  className={cn(
                    "size-3.5",
                    isBottleneckConnector ? "text-state-critical" : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "font-mono text-xs tabular-nums",
                    isBottleneckConnector
                      ? "font-bold text-state-critical"
                      : "text-muted-foreground"
                  )}
                >
                  {connectorValue === null ? "—" : formatPercent(connectorValue, locale)}
                </span>
              </div>
            )}

            <div className="flex items-center gap-2 sm:gap-3">
              <div className="w-20 shrink-0 truncate text-xs text-muted-foreground sm:w-48 sm:text-sm">{t(stage.labelKey)}</div>
              <div className="relative h-8 flex-1 rounded-lg border border-ink/10 bg-muted">
                <motion.div
                  className="h-full rounded-lg bg-signal"
                  initial={reducedMotion ? false : { width: 0 }}
                  animate={{ width: `${widthPercent}%` }}
                  transition={{
                    duration: MOTION_DURATION.slow,
                    ease: MOTION_EASE.out,
                    delay: reducedMotion ? 0 : index * 0.05,
                  }}
                />
              </div>
              <div className="w-10 shrink-0 text-right font-display text-sm font-bold tabular-nums sm:w-14">
                {value}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
