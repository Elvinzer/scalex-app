"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

import { Falco, type FalcoPose, type FalcoSize } from "./falco";
import { FalcoBubble } from "./falco-bubble";

// Shared shape for the app's one-question-at-a-time conversational flows
// (discovery-conversation.tsx, import-clarify.tsx): Falco's question
// typewriter-reveals, and the answer UI (buttons/fields) fades in only once
// the bubble is done — the same "buttons appear strictly after the text"
// pattern those flows already had, just without any delay before this.
// Give this a `key` per turn at the call site (see the plan's "no JS queue"
// decision) so React remounts it — and thus replays the morph + typewriter —
// on every new question.
export function FalcoConversationTurn({
  pose,
  size = "md",
  bubbleText,
  falcoClassName,
  children,
}: {
  pose: FalcoPose;
  size?: FalcoSize;
  bubbleText: string;
  falcoClassName?: string;
  children: React.ReactNode;
}) {
  const [typewriterDone, setTypewriterDone] = useState(false);

  return (
    <>
      <div className="flex items-start gap-3">
        <Falco pose={pose} size={size} animate="enter" className={falcoClassName} />
        <FalcoBubble
          arrow="left"
          className="max-w-none flex-1"
          text={bubbleText}
          typewriter
          onTypewriterDone={() => setTypewriterDone(true)}
        />
      </div>
      <div className={cn("transition-opacity duration-150", typewriterDone ? "opacity-100" : "pointer-events-none opacity-0")}>
        {children}
      </div>
    </>
  );
}
