"use client";

import { useState } from "react";

import { Falco, type FalcoPose } from "@/components/falco/falco";
import { ImproveChat } from "@/components/improve-chat";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
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
  agentName,
  agentIconKey,
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
  // Resolved agent display (server-computed, from agents_registry) — shown
  // in the drawer header instead of the generic "Améliorer : {topicLabel}".
  agentName?: string;
  agentIconKey?: string;
}) {
  const [open, setOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void recordImproveChatOpened(chatContext, mode);
  }

  return (
    <>
      <div className="flex items-center gap-4 rounded-[var(--radius-card)] bg-[var(--surface-dark)] px-6 py-5">
        <Falco pose={falcoPose} size="sm" />
        <p className="flex-1 text-sm font-bold text-[var(--text-on-dark)]">{stateText}</p>
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
              agentName={agentName}
              agentIconKey={agentIconKey}
            />
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
