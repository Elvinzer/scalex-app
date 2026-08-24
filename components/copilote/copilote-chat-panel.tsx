"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import { AgentChatThread, type AgentChatThreadHandle } from "@/components/agent-chat-thread";
import { FalcoChatAvatar } from "@/components/falco/falco-chat-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ConversationRow, ConversationTopicType } from "@/lib/agent/chat-history";
import type { ChatContext } from "@/lib/chat-context";
import { AGENT_KEY_TO_ROUTE, type FalcoSkinKey } from "@/lib/falco-skins";
import type { InsightHistoryItem } from "@/lib/insight-execution/types";

export function CopiloteChatPanel({
  conversationId,
  conversationTitle,
  topicType,
  topicKey,
  topicLabel,
  skin,
  onConversationChange,
  onInsightChange,
}: {
  conversationId: string;
  conversationTitle?: string;
  topicType: ConversationTopicType;
  topicKey: string | null;
  topicLabel: string | null;
  skin: FalcoSkinKey | null;
  onConversationChange: (conversation: ConversationRow) => void;
  onInsightChange: (insight: InsightHistoryItem) => void;
}) {
  const t = useTranslations("app.copilote.chat");
  const threadRef = useRef<AgentChatThreadHandle>(null);
  const route = topicKey ? AGENT_KEY_TO_ROUTE[topicKey] : undefined;

  const context: ChatContext = { topicType, topicKey, topicLabel, sourcePage: "copilote" };

  function handleReset() {
    if (!window.confirm(t("conversationResetConfirm"))) return;
    threadRef.current?.reset();
  }

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b border-border p-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <FalcoChatAvatar skin={skin} />
          <div className="min-w-0">
            <p className="truncate text-base font-bold">Falco</p>
            {topicLabel && <p className="truncate text-xs text-muted-foreground">{topicLabel}</p>}
          </div>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={t("optionsAria")}
              className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="flex w-56 flex-col p-1">
            <button
              type="button"
              onClick={handleReset}
              className="min-h-11 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-bold hover:bg-muted"
            >
              {t("restart")}
            </button>
            {route && (
              <Link href={route} prefetch={true} className="flex min-h-11 items-center rounded-[var(--radius-control)] px-3 py-2 text-left text-sm font-bold hover:bg-muted">
                {t("viewLever")}
              </Link>
            )}
          </PopoverContent>
        </Popover>
      </div>

      <AgentChatThread
        ref={threadRef}
        context={context}
        period="3-months"
        falcoSkin={skin}
        conversationId={conversationId}
        conversationTitle={conversationTitle}
        onConversationChange={onConversationChange}
        onInsightChange={onInsightChange}
      />
    </div>
  );
}
