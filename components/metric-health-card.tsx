import { forwardRef } from "react";

import { getHealthTier } from "@/lib/diagnostic/health-tier";
import type { MetricHealthCard as MetricHealthCardData } from "@/lib/diagnostic/cascade";
import { formatEur } from "@/lib/currency";
import { cn } from "@/lib/utils";

export const MetricHealthCard = forwardRef<
  HTMLDivElement,
  {
    card: MetricHealthCardData;
    auditUrl: string;
    hideAmounts: boolean;
    className?: string;
  }
>(function MetricHealthCard({ card, auditUrl, hideAmounts, className }, ref) {
  const tier = getHealthTier(card.score);
  const barWidth = Math.min(100, Math.max(0, card.score));

  const impactLine =
    tier.tier === "vert"
      ? "Au-dessus du standard ✓"
      : hideAmounts
        ? "Sous le benchmark"
        : card.monthlyGain !== null
          ? `≈ ${formatEur(card.monthlyGain)} / mois à récupérer`
          : `≈ ${card.extraClients} client${card.extraClients > 1 ? "s" : ""}/mois à récupérer`;

  return (
    <div
      ref={ref}
      className={cn("relative flex aspect-[4/5] w-full flex-col overflow-hidden rounded-[22px] p-6", className)}
      style={{ background: "#16150F" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 right-0 size-56 rounded-full"
        style={{ background: `radial-gradient(circle, ${tier.glow} 0%, transparent 70%)` }}
      />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span
            className="flex size-6 items-center justify-center rounded-md text-[11px] font-bold text-white"
            style={{ background: "var(--gradient-accent)" }}
          >
            X
          </span>
          <span className="font-display text-[13px] font-bold tracking-[-0.01em] text-[var(--text-on-dark)]">Scale X</span>
        </div>
        <span className="text-[11px] tracking-wide text-[var(--text-on-dark-muted)] uppercase">{card.category}</span>
      </div>

      <p className="relative mt-6 text-[15px] font-medium text-[var(--text-on-dark)]">{card.label}</p>

      <p className="relative mt-1 text-[56px] leading-[1.05] font-medium tabular-nums" style={{ color: tier.colorText }}>
        {card.valuePercent}%
      </p>

      <p className="relative mt-1 text-[13px] text-[var(--text-on-dark-muted)]">
        Benchmark de ta niche : {card.benchmarkPercent} %
      </p>

      <div className="relative mt-3 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "#2A2820" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${barWidth}%`, background: tier.colorBar, boxShadow: `0 0 12px ${tier.glow}` }}
        />
      </div>

      <p className="relative mt-3 text-sm font-medium" style={{ color: tier.colorText }}>
        {impactLine}
      </p>

      <p className="relative mt-auto pt-6 text-center text-[11px] text-[var(--text-on-dark-muted)]">
        Fais ton audit gratuit — {auditUrl}
      </p>
    </div>
  );
});
