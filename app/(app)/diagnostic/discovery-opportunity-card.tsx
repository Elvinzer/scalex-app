"use client";

import { useState } from "react";

import { CalcPopover } from "@/components/calc-popover";
import { ImproveChat } from "@/components/improve-chat";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { trackClient } from "@/lib/analytics-client";
import { formatEur } from "@/lib/currency";
import { cn } from "@/lib/utils";

const EFFORT_LABEL: Record<"faible" | "moyen" | "eleve", string> = { faible: "Effort faible", moyen: "Effort moyen", eleve: "Effort élevé" };
const EFFORT_CLASS: Record<"faible" | "moyen" | "eleve", string> = {
  faible: "bg-state-healthy-bg text-state-healthy",
  moyen: "bg-state-caution-bg text-state-caution",
  eleve: "bg-state-critical-bg text-state-critical",
};

// Local drawer, same technique as app/(app)/diagnostic/auto-open-improve.tsx
// — no state lifted to the global floating bubble, no new AI role (reuses
// the general Copilote as-is, per this chantier's confirmed scope).
export function DiscoveryOpportunityCard({
  leverKey,
  label,
  category,
  effort,
  impactAmountEur,
  impactExplanation,
  ctaLabel,
}: {
  leverKey: string;
  label: string;
  category: string;
  effort: "faible" | "moyen" | "eleve";
  impactAmountEur: number | null;
  impactExplanation: string;
  ctaLabel: string;
}) {
  const [open, setOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) trackClient("opportunity_chat_opened", { lever_key: leverKey });
  }

  return (
    <>
      <div className="sticker-card flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{category}</p>
            <p className="mt-0.5 font-bold">{label}</p>
          </div>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", EFFORT_CLASS[effort])}>
            {EFFORT_LABEL[effort]}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <p className="font-display text-lg font-bold tabular-nums">
            {impactAmountEur === null ? "Impact : à évaluer" : `≈ ${formatEur(impactAmountEur)}/mois`}
          </p>
          <CalcPopover explanation={impactExplanation} />
        </div>

        {/* Violet, not coral — this opens the Copilote (IA), the token
            reserved for AI/analytics actions. Coral stays free for the
            page's single non-AI priority CTA. */}
        <Button size="sm" variant="accent2" onClick={() => handleOpenChange(true)} className="self-start">
          {ctaLabel}
        </Button>
      </div>

      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent>{open && <ImproveChat metricKey="general" period="3-months" title={label} gapBadge={null} />}</DrawerContent>
      </Drawer>
    </>
  );
}
