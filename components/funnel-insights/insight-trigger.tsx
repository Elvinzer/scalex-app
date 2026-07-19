"use client";

import { Sparkle } from "lucide-react";
import { useState } from "react";

import type { FunnelStageKey } from "@/lib/agent/knowledge";

import { KeyRequiredModal } from "./key-required-modal";
import { StageInsightPanel, type ExistingStageInsight } from "./stage-insight-panel";

// The tile-grid equivalent of MarketBenchmarkAccordion's ClickableStat: opens
// the same per-stage AI insight panel, just triggered from a Setting/Closing
// stat tile instead of the Vue d'ensemble accordion. When the user has no
// working BYOK key, opens KeyRequiredModal instead of the question flow.
export function InsightTrigger({
  stage,
  label,
  existingInsight,
  hasWorkingKey,
}: {
  stage: FunnelStageKey;
  label: string;
  existingInsight: ExistingStageInsight;
  hasWorkingKey: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1 whitespace-nowrap pl-2 text-[10.5px] font-medium text-signal hover:underline"
      >
        <Sparkle className="size-[11px] fill-signal" />
        Insight
      </button>

      {open && !hasWorkingKey && <KeyRequiredModal onClose={() => setOpen(false)} />}
      {open && hasWorkingKey && (
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
