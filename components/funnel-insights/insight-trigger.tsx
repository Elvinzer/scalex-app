"use client";

import { Sparkle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import type { FunnelStageKey } from "@/lib/agent/knowledge";

import { KeyRequiredModal } from "./key-required-modal";
import { StageInsightPanel, type ExistingStageInsight } from "./stage-insight-panel";

// Opens the per-stage AI insight panel from a Setting/Closing stat tile.
// When the user has no working BYOK key, opens KeyRequiredModal instead of
// the question flow.
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
  const t = useTranslations("diagnostic.insight");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1 whitespace-nowrap pl-2 text-[10.5px] font-bold text-accent-text hover:underline"
      >
        <Sparkle className="size-[11px] fill-accent" />
        {t("label")}
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
