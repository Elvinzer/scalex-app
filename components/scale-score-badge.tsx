"use client";

import { useState } from "react";

import { ScaleScoreModal } from "@/components/scale-score-modal";
import { ScaleScoreRing } from "@/components/scale-score-ring";
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
  currentMonthlyRevenue,
  potentialMonthlyRevenue,
}: {
  scaleScore: ScaleScoreResult;
  delta7d: number | null;
  delta30d: number | null;
  sparkline: ScaleScoreSparklinePoint[];
  currentMonthlyRevenue: number | null;
  potentialMonthlyRevenue: number | null;
}) {
  const [open, setOpen] = useState(false);
  const { score, potentialScore } = scaleScore;
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
        aria-label={score === null ? "Scale Score : pas encore calculé, voir le détail" : `Scale Score : ${score} sur 100, potentiel ${potentialScore}, voir le détail`}
        onClick={() => handleOpenChange(true)}
        className="flex w-full items-center gap-3 rounded-[var(--radius-control)] border-2 border-accent/50 bg-[#211F18] px-3 py-2.5 text-left transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-[#2A2820]"
      >
        {score !== null && potentialScore !== null && <ScaleScoreRing score={score} potentialScore={potentialScore} />}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {score === null && (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ background: "var(--text-on-dark-muted)" }}
              />
            )}
            <span className="truncate text-xs text-on-dark-muted">Scale Score</span>
          </div>

          {score === null ? (
            <span className="text-xs text-on-dark-muted">À calculer</span>
          ) : (
            <>
              <span className="flex items-baseline gap-0.5">
                <span className="text-base font-medium tabular-nums" style={{ color: tier?.colorText }}>
                  {score}
                </span>
                <span className="text-[11px] text-on-dark-muted">/100</span>
                {showsUpArrow && <span className="text-[11px] text-positive">↑</span>}
              </span>
              {potentialScore !== null && potentialScore > score && (
                <p className="truncate text-[11px] text-accent">Potentiel : {potentialScore}/100</p>
              )}
            </>
          )}
        </div>
      </button>

      <ScaleScoreModal
        open={open}
        onOpenChange={handleOpenChange}
        scaleScore={scaleScore}
        delta30d={delta30d}
        sparkline={sparkline}
        currentMonthlyRevenue={currentMonthlyRevenue}
        potentialMonthlyRevenue={potentialMonthlyRevenue}
      />
    </>
  );
}
