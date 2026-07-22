import { forwardRef } from "react";

import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { formatEur } from "@/lib/currency";
import { cn } from "@/lib/utils";

const TIER_LABEL: Record<"rouge" | "ambre" | "vert", string> = {
  rouge: "Santé fragile",
  ambre: "Santé correcte",
  vert: "Santé excellente",
};

function formatMultiplier(current: number, potential: number): string {
  const ratio = potential / current;
  // parseFloat drops trailing zeros on its own (1.20 -> 1.2, 2.00 -> 2),
  // matching the reference's inconsistent-looking but correct precision
  // (×3,55 / ×1,8 / ×1,2).
  return String(parseFloat(ratio.toFixed(2))).replace(".", ",");
}

// Same dark shareable-card family as components/metric-health-card.tsx (bg
// #16150F, tier glow, Scale X logo badge, footer CTA) — this is the Scale
// Score modal's variant: potential monthly revenue "if everything the app
// flags gets fixed" instead of a single metric's %. Built from
// computeFullBenchmarkProjection (app/(app)/layout.tsx), not a new formula.
export const ScaleScoreShareCard = forwardRef<
  HTMLDivElement,
  { score: number; currentMonthlyRevenue: number; potentialMonthlyRevenue: number; className?: string }
>(function ScaleScoreShareCard({ score, currentMonthlyRevenue, potentialMonthlyRevenue, className }, ref) {
  const tier = getHealthTier(score);

  return (
    <div
      ref={ref}
      className={cn("relative flex w-full flex-col overflow-hidden rounded-[22px] p-7", className)}
      style={{ background: "#16150F" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 right-0 size-64 rounded-full"
        style={{ background: `radial-gradient(circle, ${tier.glow} 0%, transparent 70%)` }}
      />

      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="flex size-8 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ background: "var(--gradient-accent)" }}
          >
            S
          </span>
          <span className="font-display text-lg font-bold text-[var(--text-on-dark)]">Scale X</span>
        </div>
        <div className="text-right">
          <p className="text-[11px] tracking-wide text-[var(--text-on-dark-muted)] uppercase">{TIER_LABEL[tier.tier]}</p>
          <p className="font-display text-2xl font-bold tabular-nums" style={{ color: tier.colorText }}>
            {score}
            <span className="text-sm text-[var(--text-on-dark-muted)]">/100</span>
          </p>
        </div>
      </div>

      <div className="relative mt-10 flex flex-col items-center gap-2 text-center">
        <p className="text-[15px] text-[var(--text-on-dark-muted)]">Mon CA si j&apos;optimise tout</p>
        <p className="font-display text-5xl font-bold text-[var(--text-on-dark)]">{formatEur(potentialMonthlyRevenue)}</p>
        <p className="text-sm text-[var(--text-on-dark-muted)]">par mois</p>

        <div className="mt-4 flex items-center gap-3">
          <span className="text-lg font-bold text-[var(--text-on-dark-muted)]">{formatEur(currentMonthlyRevenue)}</span>
          <span className="text-[var(--text-on-dark-muted)]">→</span>
          <span className="rounded-full px-3.5 py-1.5 text-base font-bold text-white" style={{ background: tier.colorBar }}>
            ×{formatMultiplier(currentMonthlyRevenue, potentialMonthlyRevenue)}
          </span>
        </div>
      </div>

      <p className="relative mt-10 text-center text-[11px] text-[var(--text-on-dark-muted)]">
        Fais ta projection gratuite — scalex.app
      </p>
    </div>
  );
});
