"use client";

import { Sparkle } from "lucide-react";
import { useState } from "react";

import type { FunnelStageKey } from "@/lib/agent/knowledge";

import { StageInsightPanel, type ExistingStageInsight } from "./stage-insight-panel";

// The tile-grid equivalent of MarketBenchmarkAccordion's ClickableStat: opens
// the same per-stage AI insight panel, just triggered from a Setting/Closing
// stat tile instead of the Vue d'ensemble accordion.
export function InsightTrigger({
  stage,
  label,
  existingInsight,
}: {
  stage: FunnelStageKey;
  label: string;
  existingInsight: ExistingStageInsight;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1 whitespace-nowrap pl-2 text-[10.5px] font-bold text-signal hover:underline"
      >
        <Sparkle className="size-[11px] fill-signal" />
        Insight
      </button>

      {open && (
        <StageInsightPanel
          stage={stage}
          label={label}
          existingInsight={existingInsight}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
