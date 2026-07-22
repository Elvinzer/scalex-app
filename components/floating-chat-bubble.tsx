"use client";

import { useState } from "react";

import { Falco } from "@/components/falco/falco";
import { ImproveChat } from "@/components/improve-chat";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";
import { cn } from "@/lib/utils";

// Global "discuter de tes datas" launcher — available on every authenticated
// page (mounted once in app/(app)/layout.tsx). Opens the same chat drawer as
// the per-metric flow, but in general mode (metricKey: "general") — the AI
// gets the user's full diagnostic instead of one specific point.
//
// hasUnseenInsight (computed server-side in app/(app)/layout.tsx) drives the
// notification dot + pulsing glow — a proactive "the AI wants to tell you
// something" cue rather than a purely decorative bubble. Dismissed locally
// the moment the drawer is opened, for instant feedback, independent of
// when the underlying server-side signal itself clears.
export function FloatingChatBubble({ hasUnseenInsight = false }: { hasUnseenInsight?: boolean }) {
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const showNotification = hasUnseenInsight && !dismissed;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDismissed(true);
      void recordImproveChatOpened("general");
    }
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={showNotification ? "Falco a une remarque pour toi — discuter de tes datas" : "Discuter avec Falco, ton copilote IA"}
          className={cn(
            // Violet, not coral — this launches the Copilote (IA), the
            // token reserved for AI/analytics actions. Coral stays reserved
            // for the page's own priority CTA underneath.
            "group fixed right-6 bottom-6 z-30 flex size-14 items-center justify-center rounded-full bg-accent-2 shadow-[var(--shadow-float)] transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-accent-2-hover",
            showNotification && "animate-[glow-pulse-accent2_2s_ease-in-out_infinite]"
          )}
        >
          <Falco
            variant="bust"
            size="sm"
            animate="none"
            className="transition-transform duration-[var(--motion-fast)] ease-[var(--ease-out)] group-hover:-rotate-3 group-hover:scale-110"
          />
          {showNotification && (
            <span className="absolute -top-1 -right-1 flex size-4">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-state-caution opacity-75" />
              <span className="relative inline-flex size-4 rounded-full border-2 border-surface bg-state-caution" />
            </span>
          )}
        </button>
      </DrawerTrigger>
      <DrawerContent>
        {open && (
          <ImproveChat metricKey="general" period="3-months" title="Tes datas" gapBadge={null} />
        )}
      </DrawerContent>
    </Drawer>
  );
}
