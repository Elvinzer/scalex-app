"use client";

import { useState } from "react";

import { LazyImproveChat } from "@/components/lazy-improve-chat";
import { FalcoDrawer } from "@/components/falco/falco-drawer";
import { DrawerContent } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";
import { cn } from "@/lib/utils";

const TIER_CLASS: Record<"rouge" | "ambre" | "vert", string> = {
  rouge: "bg-state-critical-bg text-state-critical",
  ambre: "bg-state-caution-bg text-state-caution",
  vert: "bg-state-healthy-bg text-state-healthy",
};

// Per-item performance score (posts-table.tsx/campaigns-table.tsx) — a
// clickable badge, not just a number: opens the page's own lever agent
// drawer with a pre-seeded question about THIS specific item's score, so
// Falco explains why and suggests an improvement instead of the user
// having to type it themselves. Same local-drawer pattern as
// discovery-opportunity-card.tsx/priority-recommendation-card.tsx.
export function ItemScoreButton({
  score,
  chatContext,
  seedQuestion,
  falcoSkin,
}: {
  score: number;
  chatContext: ChatContext;
  seedQuestion: string;
  falcoSkin?: import("@/lib/falco-skins").FalcoSkinKey | null;
}) {
  const [open, setOpen] = useState(false);
  const tier = getHealthTier(score);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void recordImproveChatOpened(chatContext);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={cn(
          "rounded-full px-2 py-0.5 text-xs font-bold tabular-nums hover:opacity-80",
          TIER_CLASS[tier.tier]
        )}
      >
        {score}/100
      </button>

      <FalcoDrawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent>
          {open && (
            <LazyImproveChat
              context={chatContext}
              period="3-months"
              gapBadge={null}
              falcoSkin={falcoSkin}
              seedQuestion={seedQuestion}
            />
          )}
        </DrawerContent>
      </FalcoDrawer>
    </>
  );
}
