"use client";

import { MessageCircle } from "lucide-react";
import { useState } from "react";

import { ImproveChat } from "@/components/improve-chat";
import { Drawer, DrawerContent, DrawerTrigger } from "@/components/ui/drawer";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";

// Global "discuter de tes datas" launcher — available on every authenticated
// page (mounted once in app/(app)/layout.tsx). Opens the same chat drawer as
// the per-metric flow, but in general mode (metricKey: "general") — the AI
// gets the user's full diagnostic instead of one specific point.
export function FloatingChatBubble() {
  const [open, setOpen] = useState(false);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) void recordImproveChatOpened("general");
  }

  return (
    <Drawer open={open} onOpenChange={handleOpenChange}>
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label="Discuter de tes datas"
          className="fixed right-6 bottom-6 z-30 flex size-14 items-center justify-center rounded-full bg-accent text-white shadow-[var(--shadow-float)] transition-colors duration-150 hover:bg-accent-hover"
        >
          <MessageCircle className="size-6" />
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
