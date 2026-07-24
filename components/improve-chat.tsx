"use client";

import { RotateCcw, X } from "lucide-react";
import { useRef } from "react";

import { AgentChatThread, type AgentChatThreadHandle } from "@/components/agent-chat-thread";
import { Falco } from "@/components/falco/falco";
import { LeverAgentIcon } from "@/components/lever-agent-icon";
import { DrawerClose, DrawerTitle } from "@/components/ui/drawer";
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
  agentName,
  agentIconKey,
  falcoSkin,
}: {
  context: ChatContext;
  followupKey?: string | null;
  period: Period;
  gapBadge: string | null;
  mode?: LeverMode | null;
  agentName?: string;
  agentIconKey?: string;
  // Purely visual — resolved by the caller (AgentBanner from its own page's
  // route, or the floating bubble from usePathname()) via lib/falco-skins.ts.
  // Never affects ChatContext/the agent resolved server-side.
  falcoSkin?: FalcoSkinKey | null;
}) {
  const isPersisted = context.topicType !== "metric";
  const threadRef = useRef<AgentChatThreadHandle>(null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex items-start gap-3">
          {falcoSkin ? (
            <Falco skin={falcoSkin} portrait skinSizePx={32} className="rounded-full" priority />
          ) : (
            <Falco pose="neutral" size="sm" />
          )}
          <div>
            <div className="flex items-center gap-2">
              {agentIconKey && <LeverAgentIcon iconKey={agentIconKey} />}
              <DrawerTitle className="text-base font-bold">
                {agentName ?? (context.topicType === "general" ? "Copilote" : `Améliorer : ${context.topicLabel}`)}
              </DrawerTitle>
            </div>
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
              className="flex size-7 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted disabled:opacity-50"
            >
              <RotateCcw className="size-3.5" />
            </button>
          )}
          <DrawerClose className="flex size-7 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted">
            <X className="size-4" />
          </DrawerClose>
        </div>
      </div>

      <AgentChatThread ref={threadRef} context={context} followupKey={followupKey} period={period} mode={mode} falcoSkin={falcoSkin} />
    </div>
  );
}
