"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useRef } from "react";

import { AgentChatThread, type AgentChatThreadHandle } from "@/components/agent-chat-thread";
import { Falco } from "@/components/falco/falco";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ChatContext } from "@/lib/chat-context";
import { AGENT_KEY_TO_ROUTE, AGENT_KEY_TO_TOPIC_LABEL, type FalcoSkinKey } from "@/lib/falco-skins";

type LeverMode = "optimiser" | "demarrer" | "decouverte";

export function CopiloteChatPanel({
  agentKey,
  name,
  skin,
  gapBadge,
  mode,
  agentNameToKey,
  onSelectAgent,
}: {
  agentKey: string;
  name: string;
  skin: FalcoSkinKey | null;
  gapBadge: string | null;
  mode: LeverMode | null;
  agentNameToKey: Record<string, string>;
  onSelectAgent: (agentKey: string) => void;
}) {
  const threadRef = useRef<AgentChatThreadHandle>(null);
  const isGeneral = agentKey === "general";
  const route = AGENT_KEY_TO_ROUTE[agentKey];

  const context: ChatContext = isGeneral
    ? { topicType: "general", topicKey: null, topicLabel: null, sourcePage: "copilote" }
    : { topicType: "lever", topicKey: agentKey, topicLabel: AGENT_KEY_TO_TOPIC_LABEL[agentKey] ?? name, sourcePage: "copilote" };

  function handleReset() {
    if (!window.confirm("Recommencer cette conversation à zéro ?")) return;
    threadRef.current?.reset();
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex items-center gap-3">
          {skin ? (
            <Falco skin={skin} portrait skinSizePx={32} className="rounded-full" priority />
          ) : (
            <Falco pose="neutral" size="sm" />
          )}
          <div>
            <p className="text-base font-bold">{name}</p>
            {gapBadge && (
              <span className="mt-1 inline-flex rounded-[var(--radius-control)] bg-accent-2-soft px-2 py-0.5 text-xs font-bold text-accent-2-text">
                {gapBadge}
              </span>
            )}
          </div>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Options de la conversation"
              className="flex size-8 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-56 flex-col p-1">
            <button
              type="button"
              onClick={handleReset}
              className="rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-bold hover:bg-muted"
            >
              Recommencer à zéro
            </button>
            {route && (
              <Link href={route} className="rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-bold hover:bg-muted">
                Voir la page du levier →
              </Link>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <AgentChatThread
        ref={threadRef}
        context={context}
        period="3-months"
        mode={mode}
        falcoSkin={skin}
        agentNameToKey={agentNameToKey}
        onSelectAgent={onSelectAgent}
      />
    </div>
  );
}
