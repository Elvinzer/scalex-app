"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { ChatErrorBoundary } from "@/components/chat-error-boundary";
import { ConversationHistoryPanel } from "@/components/copilote/conversation-history-panel";
import { CopiloteChatPanel } from "@/components/copilote/copilote-chat-panel";
import { Falco } from "@/components/falco/falco";
import { AGENT_KEY_CONSOLIDATION } from "@/lib/agent/agent-consolidation";
import type { ConversationRow, ConversationWithPreview } from "@/lib/agent/chat-history";
import { resolveConversationForTopic, startNewConversation } from "@/lib/agent/chat-history-actions";
import { recordCopiloteConversationOpened, recordCopiloteNewConversation, recordCopiloteTopic } from "@/lib/agent/copilote-tracking";
import { AGENT_KEY_TO_SKIN, AGENT_KEY_TO_TOPIC_LABEL, type FalcoSkinKey } from "@/lib/falco-skins";
import type { InsightHistoryItem } from "@/lib/insight-execution/types";

function skinFor(topicKey: string | null, topicType: ConversationRow["topicType"]): FalcoSkinKey | null {
  if (topicType === "content_idea") return "contenu";
  if (!topicKey) return null;
  const consolidatedKey = AGENT_KEY_CONSOLIDATION[topicKey] ?? topicKey;
  return AGENT_KEY_TO_SKIN[consolidatedKey] ?? null;
}

// Prepends (or replaces, if already present) a conversation and keeps the
// list sorted by recency — used whenever a conversation is created/resumed
// client-side, so the history panel never needs a full server round-trip to
// reflect what the chat panel is already showing.
function upsertConversation(
  list: ConversationWithPreview[],
  conversation: ConversationRow,
  preview: string | null = null
): ConversationWithPreview[] {
  const previous = list.find((item) => item.id === conversation.id);
  const withoutExisting = list.filter((item) => item.id !== conversation.id);
  return [{
    ...conversation,
    preview,
    messageCount: previous?.messageCount ?? 0,
    insightId: previous?.insightId ?? null,
    insightDecision: previous?.insightDecision ?? null,
  }, ...withoutExisting].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export function CopilotePageClient({
  conversations: initialConversations,
  initialTopicKey,
  initialConversationId,
}: {
  conversations: ConversationWithPreview[];
  initialTopicKey: string | null;
  initialConversationId: string | null;
}) {
  const t = useTranslations("app.copilote");
  const [conversations, setConversations] = useState(initialConversations);
  const linkedConversation = initialConversationId ? initialConversations.find((item) => item.id === initialConversationId) : null;
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(linkedConversation?.id ?? initialConversations[0]?.id ?? null);
  const [resolvingDeepLink, setResolvingDeepLink] = useState(Boolean(initialTopicKey || initialConversationId));

  // Deep link from the floating bubble ("Ouvrir dans le Copilote →",
  // ?topic=X) finds-or-creates the matching conversation — same
  // "créent/rouvrent" semantics as every lever page's own inline chat.
  useEffect(() => {
    if (initialConversationId) {
      if (linkedConversation) setSelectedConversationId(linkedConversation.id);
      setResolvingDeepLink(false);
      return;
    }
    if (!initialTopicKey) {
      setResolvingDeepLink(false);
      return;
    }
    void (async () => {
      void recordCopiloteTopic(initialTopicKey);
      const resolved = await resolveConversationForTopic("lever", initialTopicKey, AGENT_KEY_TO_TOPIC_LABEL[initialTopicKey] ?? null);
      if (!("error" in resolved)) {
        setConversations((prev) => upsertConversation(prev, resolved));
        setSelectedConversationId(resolved.id);
      }
      setResolvingDeepLink(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectConversation(id: string) {
    setSelectedConversationId(id);
    void recordCopiloteConversationOpened(true);
  }

  async function handleNewConversation() {
    const created = await startNewConversation("general", null, null);
    if ("error" in created) return;
    setConversations((prev) => upsertConversation(prev, created));
    setSelectedConversationId(created.id);
    void recordCopiloteNewConversation();
  }

  // The active thread bumps its own conversation on every message and can
  // switch to a brand new one (in-thread "Nouvelle conversation") — synced
  // here with the full row so the history panel never goes stale and the
  // chat panel never briefly loses its selected conversation mid-switch.
  function handleConversationChange(conversation: ConversationRow) {
    setSelectedConversationId(conversation.id);
    setConversations((prev) => upsertConversation(prev, conversation));
  }

  function handleInsightChange(insight: InsightHistoryItem) {
    setConversations((prev) => prev.map((conversation) => conversation.id === insight.sourceId
      ? { ...conversation, insightId: insight.id, insightDecision: insight.decision }
      : conversation));
  }

  const selected = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label={t("contextAria")}>
        <span className="rounded-full border border-accent-2-border bg-accent-2-soft px-3 py-1.5 text-xs font-bold text-accent-2-text">{t("context")} · {selected?.topicLabel ?? t("globalView")}</span>
        <span className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">{t("period")} · {t("lastThreeMonths")}</span>
        <span className="rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">{t("data")} · {t("dataSummary")}</span>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-hidden lg:flex-row lg:gap-0">
        <div className="lg:hidden">
          <ConversationHistoryPanel
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelect={selectConversation}
            onNewConversation={() => void handleNewConversation()}
            compact
          />
        </div>

        <div className="flex flex-1 flex-col overflow-hidden rounded-[var(--radius-card)] border border-border lg:rounded-r-none">
          {selected ? (
            // Keyed by conversation id so switching conversations always
            // fully remounts the thread (fresh messages/isStreaming/
            // history-loaded state) instead of reusing the previous one's
            // component instance.
            <ChatErrorBoundary key={selected.id}>
              <CopiloteChatPanel
                conversationId={selected.id}
                conversationTitle={selected.title}
                topicType={selected.topicType}
                topicKey={selected.topicKey}
                topicLabel={selected.topicLabel}
                skin={skinFor(selected.topicKey, selected.topicType)}
                onConversationChange={handleConversationChange}
                onInsightChange={handleInsightChange}
              />
            </ChatErrorBoundary>
          ) : resolvingDeepLink ? (
            <div className="flex flex-1 items-center justify-center">
              <Falco pose="neutral" size="md" />
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
              <Falco pose="neutral" size="md" />
              <p className="max-w-sm text-sm text-muted-foreground">{t("empty")}</p>
            </div>
          )}
        </div>

        <div className="hidden w-[280px] shrink-0 lg:block">
          <ConversationHistoryPanel
            conversations={conversations}
            selectedConversationId={selectedConversationId}
            onSelect={selectConversation}
            onNewConversation={() => void handleNewConversation()}
          />
        </div>
      </div>
    </div>
  );
}
