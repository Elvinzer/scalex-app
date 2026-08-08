"use client";

import type { ConversationWithPreview } from "@/lib/agent/chat-history";
import { ConversationHistoryPanel } from "@/components/copilote/conversation-history-panel";

export function FalcoInsightHistoryFixture({ conversations }: { conversations: ConversationWithPreview[] }) {
  return (
    <ConversationHistoryPanel
      conversations={conversations}
      selectedConversationId={conversations[0]?.id ?? null}
      onSelect={() => undefined}
      onNewConversation={() => undefined}
    />
  );
}
