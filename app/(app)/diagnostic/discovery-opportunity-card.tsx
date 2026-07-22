"use client";

import { useState } from "react";

import { CalcPopover } from "@/components/calc-popover";
import { ImproveChat } from "@/components/improve-chat";
import { LeverBenchmarkBar } from "@/components/lever-benchmark-bar";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
import { formatEur } from "@/lib/currency";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";
import { LEVER_BENCHMARK_INFO } from "@/lib/levers/benchmark-info";
import { cn } from "@/lib/utils";

const EFFORT_LABEL: Record<"faible" | "moyen" | "eleve", string> = { faible: "Effort faible", moyen: "Effort moyen", eleve: "Effort élevé" };
const EFFORT_CLASS: Record<"faible" | "moyen" | "eleve", string> = {
  faible: "bg-state-healthy-bg text-state-healthy",
  moyen: "bg-state-caution-bg text-state-caution",
  eleve: "bg-state-critical-bg text-state-critical",
};

// Market-average time to FIRST results, by effort tier — an order-of-magnitude
// expectation to encourage ("à minima les premiers résultats"), not a precise
// forecast, hence "en moyenne". Tied to effort like FALLBACK_EXTRA_CLIENTS in
// opportunities.ts rather than invented per-lever.
const EFFORT_TIME_HORIZON: Record<"faible" | "moyen" | "eleve", string> = {
  faible: "1 à 2 semaines",
  moyen: "1 à 2 mois",
  eleve: "3 à 6 mois",
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
  currentValue,
  sourcePage,
}: {
  leverKey: string;
  label: string;
  category: string;
  effort: "faible" | "moyen" | "eleve";
  impactAmountEur: number | null;
  impactExplanation: string;
  ctaLabel: string;
  // Only known for "actifs à surveiller" (the lever is active, this is its
  // current KPI value) — absent for "à implémenter" (no current value yet).
  currentValue?: number | null;
  // Where this card is rendered — for improve_chat_opened's source_page.
  sourcePage: string;
}) {
  const [open, setOpen] = useState(false);
  const info = LEVER_BENCHMARK_INFO[leverKey];

  const chatContext: ChatContext = { topicType: "lever", topicKey: leverKey, topicLabel: label, sourcePage };
  const gapBadge =
    currentValue !== undefined && currentValue !== null && info?.okMax !== undefined
      ? `${Math.round(currentValue * 100)}% → objectif ${Math.round(info.okMax * 100)}%`
      : null;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void recordImproveChatOpened(chatContext);
  }

  return (
    <>
      <div className="sticker-card flex flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{category}</p>
            <p className="mt-0.5 font-bold">{label}</p>
            {info && <p className="mt-1 text-xs text-muted-foreground">{info.whatIsThis}</p>}
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

        {/* Time-to-first-results horizon — only on "à implémenter" cards (a
            lever not yet in place, i.e. no currentValue), to set an honest
            expectation next to the € potential. */}
        {currentValue === undefined && (
          <p className="text-xs text-muted-foreground">
            ⏱ Premiers résultats : ≈ {EFFORT_TIME_HORIZON[effort]} en moyenne
          </p>
        )}

        {info?.badMax !== undefined && info?.okMax !== undefined && (
          <LeverBenchmarkBar
            badMax={info.badMax}
            okMax={info.okMax}
            excellentAt={info.excellentAt}
            currentValue={currentValue}
            centralLabel={info.centralLabel}
          />
        )}

        {/* Outline, not a filled accent — these cards are a grid of equivalent
            options, none is THE priority CTA, so filled accents (corail =
            priority, violet = IA) stay reserved for single, unique CTAs. */}
        <Button size="sm" variant="outline" onClick={() => handleOpenChange(true)} className="self-start">
          {ctaLabel}
        </Button>
      </div>

      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent>{open && <ImproveChat context={chatContext} period="3-months" gapBadge={gapBadge} />}</DrawerContent>
      </Drawer>
    </>
  );
}
