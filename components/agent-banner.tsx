"use client";

import { useState } from "react";

import { Falco, type FalcoPose } from "@/components/falco/falco";
import { ImproveChat } from "@/components/improve-chat";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
import type { FalcoSkinKey } from "@/lib/falco-skins";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";

// The single dark block on a lever page (design system rule: one CTA, one
// dark block per screen) — dumb/reusable on purpose: `stateText` and
// `chatContext` are computed by the PAGE from data it already has, so this
// component never needs its own diagnostic-engine/metric-key coupling.
// Opens the Copilote drawer with the same Drawer+ChatContext pattern as
// app/(app)/diagnostic/discovery-opportunity-card.tsx (local `open` state,
// never rendered "naked" without a topic).
export function AgentBanner({
  stateText,
  ctaLabel,
  chatContext,
  falcoPose = "thinking",
  period = "3-months",
  gapBadge = null,
  mode = null,
  falcoSkin,
}: {
  stateText: string;
  ctaLabel: string;
  chatContext: ChatContext;
  falcoPose?: FalcoPose;
  period?: "3-months" | "current-month" | "12-months";
  gapBadge?: string | null;
  // Only meaningful for topicType: "lever" pages with a double/triple mode —
  // threads through to the request body so buildImprovePrompt picks the
  // right MISSION wording (Optimiser/Démarrer/Découverte).
  mode?: "optimiser" | "demarrer" | "decouverte" | null;
  // Per-page illustrated skin (lib/falco-skins.ts), resolved by the page
  // from its own known route. Falls back to the generic bust when absent.
  falcoSkin?: FalcoSkinKey | null;
}) {
  const [open, setOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void recordImproveChatOpened(chatContext, mode);
  }

  return (
    <>
      <div className="relative flex items-center gap-4 overflow-visible rounded-[var(--radius-card)] bg-[var(--surface-dark)] px-6 py-5">
        {falcoSkin ? (
          <div className="relative w-16 shrink-0 self-stretch">
            <Falco skin={falcoSkin} skinSizePx={64} priority className="absolute -top-2 left-0" />
          </div>
        ) : (
          <Falco pose={falcoPose} size="sm" />
        )}
        <p className="min-w-0 flex-1 text-sm font-bold text-[var(--text-on-dark)]">{stateText}</p>
        <Button onClick={() => handleOpenChange(true)} className="shrink-0">
          {ctaLabel}
        </Button>
      </div>

      <Drawer open={open} onOpenChange={handleOpenChange}>
        <DrawerContent>
          {open && (
            <ImproveChat
              context={chatContext}
              period={period}
              gapBadge={gapBadge}
              mode={mode}
              falcoSkin={falcoSkin}
            />
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
