"use client";

import { useState } from "react";

import { CalcPopover } from "@/components/calc-popover";
import { ImproveChat } from "@/components/improve-chat";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
import { formatEur } from "@/lib/currency";
import { getHealthTier, type HealthTier } from "@/lib/diagnostic/health-tier";
import { recordImproveChatOpened, recordPriorityRecoClicked } from "@/lib/improve-chat-tracking";
import { cn } from "@/lib/utils";

const TIER_LABEL: Record<HealthTier, string> = { rouge: "Critique", ambre: "À surveiller", vert: "Sain" };
const TIER_CLASS: Record<HealthTier, string> = {
  rouge: "bg-state-critical-bg text-state-critical",
  ambre: "bg-state-caution-bg text-state-caution",
  vert: "bg-state-healthy-bg text-state-healthy",
};

// Local drawer, same technique as app/(app)/diagnostic/discovery-opportunity-card.tsx
// and app/(app)/diagnostic/auto-open-improve.tsx — generalized to build a
// "metric" or "lever" ChatContext depending on which kind of candidate the
// priority engine picked.
export function PriorityRecommendationCard({
  rank,
  topicType,
  topicKey,
  label,
  category,
  healthScore,
  extraClientsPerMonth,
  monthlyGainEur,
  why,
  explanationPopover,
  priorityScore,
  sourcePage,
}: {
  rank: 1 | 2 | 3;
  topicType: "metric" | "lever";
  topicKey: string;
  label: string;
  category: string;
  healthScore: number;
  extraClientsPerMonth: number | null;
  monthlyGainEur: number;
  why: string;
  explanationPopover: string;
  priorityScore: number;
  sourcePage: string;
}) {
  const [open, setOpen] = useState(false);
  const isTop = rank === 1;
  const tier = getHealthTier(healthScore);

  const chatContext: ChatContext = { topicType, topicKey, topicLabel: label, sourcePage };

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      void recordImproveChatOpened(chatContext);
      void recordPriorityRecoClicked(topicKey, rank, priorityScore);
    }
  }

  return (
    <>
      <div
        className={cn(
          "sticker-card flex flex-col gap-3 p-5",
          isTop && "border-accent/40 bg-linear-to-br from-accent-soft to-transparent"
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">
              #{rank} · {category}
            </p>
            <p className="mt-0.5 font-bold">{label}</p>
          </div>
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap", TIER_CLASS[tier.tier])}>
            {TIER_LABEL[tier.tier]}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <p className="font-display text-lg font-bold tabular-nums">
            {extraClientsPerMonth !== null && `+${extraClientsPerMonth} clients/mois · `}≈ {formatEur(monthlyGainEur)}/mois
          </p>
          <CalcPopover explanation={explanationPopover} />
        </div>

        <p className="text-sm text-muted-foreground">{why}</p>

        <Button
          size="sm"
          variant={isTop ? "default" : "outline"}
          onClick={() => handleOpenChange(true)}
          className="self-start"
        >
          Améliorer avec Falco →
        </Button>
      </div>

      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent>{open && <ImproveChat context={chatContext} period="3-months" gapBadge={null} />}</DrawerContent>
      </Drawer>
    </>
  );
}
