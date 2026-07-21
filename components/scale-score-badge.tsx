"use client";

import { useState } from "react";

import { ScaleScoreModal } from "@/components/scale-score-modal";
import { trackClient } from "@/lib/analytics-client";
import type { ScaleScoreResult } from "@/lib/diagnostic/scale-score";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import type { ScaleScoreSparklinePoint } from "@/lib/scale-score-history/queries";

// Sits in components/app-sidebar.tsx, above the profile block, outside the
// scrollable <nav> — always rendered (never hidden), including the
// no-score empty state. Never computes or caches a score itself: everything
// it shows is passed down from app/(app)/layout.tsx, which always
// recomputes live from lib/diagnostic/scale-score.ts.
export function ScaleScoreBadge({
  scaleScore,
  delta7d,
  delta30d,
  sparkline,
}: {
  scaleScore: ScaleScoreResult;
  delta7d: number | null;
  delta30d: number | null;
  sparkline: ScaleScoreSparklinePoint[];
}) {
  const [open, setOpen] = useState(false);
  const { score } = scaleScore;
  const tier = score !== null ? getHealthTier(score) : null;
  const showsUpArrow = delta7d !== null && delta7d >= 1;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) trackClient("score_badge_clicked");
  }

  return (
    <>
      <button
        type="button"
        role="button"
        aria-label={score === null ? "Scale Score : pas encore calculé, voir le détail" : `Scale Score : ${score} sur 100, voir le détail`}
        onClick={() => handleOpenChange(true)}
        className="flex w-full items-center gap-2 rounded-[var(--radius-control)] bg-[#211F18] px-3 py-2.5 text-left transition-colors duration-150 hover:bg-[#2A2820]"
      >
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: tier ? tier.colorBar : "var(--text-on-dark-muted)" }}
        />
        <span className="flex-1 truncate text-xs text-on-dark-muted">Scale Score</span>
        {score === null ? (
          <span className="text-xs text-on-dark-muted">À calculer</span>
        ) : (
          <span className="flex items-baseline gap-0.5">
            <span className="text-base font-medium tabular-nums" style={{ color: tier?.colorText }}>
              {score}
            </span>
            <span className="text-[11px] text-on-dark-muted">/100</span>
            {showsUpArrow && <span className="text-[11px] text-positive">↑</span>}
          </span>
        )}
      </button>

      <ScaleScoreModal open={open} onOpenChange={handleOpenChange} scaleScore={scaleScore} delta30d={delta30d} sparkline={sparkline} />
    </>
  );
}
