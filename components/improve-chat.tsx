"use client";

import { RotateCcw, X } from "lucide-react";
import { useRef } from "react";

import { AgentChatThread, type AgentChatThreadHandle } from "@/components/agent-chat-thread";
import { ChatErrorBoundary } from "@/components/chat-error-boundary";
import { Falco } from "@/components/falco/falco";
import { DrawerClose, DrawerTitle } from "@/components/ui/drawer";
import { useFalcoConversationEngagement } from "@/components/use-falco-conversation-guard";
import type { ChatContext } from "@/lib/chat-context";
import type { FalcoSkinKey } from "@/lib/falco-skins";

type Period = "3-months" | "current-month" | "12-months";
type LeverMode = "optimiser" | "demarrer" | "decouverte";

// Drawer chrome (header + close button) around the shared AgentChatThread
// (components/agent-chat-thread.tsx) — the message list/streaming/history
// logic itself lives there, reused verbatim by the Copilote hub page
// (components/copilote/copilote-chat-panel.tsx). This component owns
// nothing conversation-related anymore, only the drawer-specific chrome.
export function ImproveChat({
  context,
  followupKey,
  period,
  gapBadge,
  mode = null,
  falcoSkin,
  seedQuestion,
  onEngaged,
}: {
  context: ChatContext;
  followupKey?: string | null;
  period: Period;
  gapBadge: string | null;
  mode?: LeverMode | null;
  // Purely visual — resolved by the caller (AgentBanner from its own page's
  // route, or the floating bubble from usePathname()) via lib/falco-skins.ts.
  // Never affects ChatContext/the agent resolved server-side.
  falcoSkin?: FalcoSkinKey | null;
  // See AgentChatThread's own doc — an opening question to fire on top of
  // this thread (e.g. a specific post/campaign's score), asked once on open.
  seedQuestion?: string;
  // See AgentChatThread's own doc — lets a drawer-owning container (the
  // floating chat bubble) confirm before closing mid-conversation.
  onEngaged?: () => void;
}) {
  const isPersisted = context.topicType !== "metric";
  const threadRef = useRef<AgentChatThreadHandle>(null);
  const drawerEngagement = useFalcoConversationEngagement();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex items-start gap-3">
          {falcoSkin ? (
            <Falco skin={falcoSkin} portrait skinSizePx={32} className="rounded-full" priority />
          ) : (
            <Falco pose="neutral" size="sm" />
          )}
          <div className="min-w-0">
            <DrawerTitle className="text-base font-bold">Falco</DrawerTitle>
            {context.topicLabel && <p className="truncate text-xs text-muted-foreground">{context.topicLabel}</p>}
            {gapBadge && (
              <span className="mt-1 inline-flex rounded-[var(--radius-control)] bg-accent-2-soft px-2 py-0.5 text-xs font-bold text-accent-2-text">
                {gapBadge}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {isPersisted && (
            <button
              type="button"
              onClick={() => threadRef.current?.reset()}
              aria-label="Nouvelle conversation"
              title="Nouvelle conversation"
              className="flex size-11 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
          <DrawerClose className="flex size-11 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </DrawerClose>
        </div>
      </div>

      <ChatErrorBoundary>
        <AgentChatThread
          ref={threadRef}
          context={context}
          followupKey={followupKey}
          period={period}
          mode={mode}
          falcoSkin={falcoSkin}
          seedQuestion={seedQuestion}
          onEngaged={onEngaged ?? drawerEngagement ?? undefined}
        />
      </ChatErrorBoundary>
    </div>
  );
}
