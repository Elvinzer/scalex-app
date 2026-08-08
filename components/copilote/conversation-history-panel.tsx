"use client";

import { Plus } from "lucide-react";

import { Falco } from "@/components/falco/falco";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ConversationWithPreview } from "@/lib/agent/chat-history";
import type { InsightDecision } from "@/lib/insight-execution/types";
import { cn } from "@/lib/utils";

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "2-digit" });
const DAY_MS = 24 * 60 * 60 * 1000;

const ACTION_LABELS: Record<InsightDecision, string> = {
  todo: "Action à traiter",
  launched: "Action lancée",
  later: "Action à reprendre",
  dismissed: "Action écartée",
  completed: "Action terminée",
};

function truncate(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 60 ? `${singleLine.slice(0, 60)}…` : singleLine;
}

// Only grouped into Aujourd'hui/Cette semaine/Avant once the list is long
// enough that scanning it flat stops being convenient — an ungrouped list
// under that threshold is simpler to scan than 1-2 sparse headers.
function groupConversations(
  conversations: ConversationWithPreview[]
): { label: string | null; items: ConversationWithPreview[] }[] {
  if (conversations.length <= 10) return [{ label: null, items: conversations }];

  const now = Date.now();
  const today: ConversationWithPreview[] = [];
  const thisWeek: ConversationWithPreview[] = [];
  const before: ConversationWithPreview[] = [];
  for (const conversation of conversations) {
    const ageMs = now - new Date(conversation.updatedAt).getTime();
    if (ageMs < DAY_MS) today.push(conversation);
    else if (ageMs < 7 * DAY_MS) thisWeek.push(conversation);
    else before.push(conversation);
  }
  return [
    { label: "Aujourd'hui", items: today },
    { label: "Cette semaine", items: thisWeek },
    { label: "Avant", items: before },
  ].filter((group) => group.items.length > 0);
}

// Dumb/reusable — the parent (app/(app)/copilote/copilote-page-client.tsx)
// owns which conversation is selected and how a new one gets created; this
// component only renders the list. `compact` renders the same list inside a
// popover behind a single trigger button (< 1024px), not a separate layout.
export function ConversationHistoryPanel({
  conversations,
  selectedConversationId,
  onSelect,
  onNewConversation,
  compact = false,
}: {
  conversations: ConversationWithPreview[];
  selectedConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  compact?: boolean;
}) {
  const groups = groupConversations(conversations);
  const selected = conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;

  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-[var(--radius-control)] border border-border px-3 py-2 text-left text-sm font-bold"
          >
            <span className="truncate">{selected?.title ?? "Choisis une conversation"}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="max-h-[70vh] w-[calc(100vw-2rem)] overflow-y-auto p-2">
          <ConversationList
            groups={groups}
            selectedConversationId={selectedConversationId}
            onSelect={onSelect}
            onNewConversation={onNewConversation}
          />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-border">
      <div className="flex-1 overflow-y-auto p-3">
        <ConversationList
          groups={groups}
          selectedConversationId={selectedConversationId}
          onSelect={onSelect}
          onNewConversation={onNewConversation}
        />
      </div>
    </div>
  );
}

function ConversationList({
  groups,
  selectedConversationId,
  onSelect,
  onNewConversation,
}: {
  groups: { label: string | null; items: ConversationWithPreview[] }[];
  selectedConversationId: string | null;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
}) {
  const isEmpty = groups.every((group) => group.items.length === 0);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={onNewConversation}
        className="mb-2 flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-border px-3 py-2 text-left text-sm font-bold hover:bg-muted"
      >
        <Plus className="size-4" />
        Nouvelle conversation
      </button>

      {isEmpty ? (
        <p className="px-2 py-4 text-center text-sm text-muted-foreground">Pas encore de conversation.</p>
      ) : (
        groups.map((group, index) => (
          <div key={group.label ?? index}>
            {group.label && (
              <p className="mt-3 mb-1 px-2 text-xs font-bold tracking-wide text-muted-foreground uppercase">{group.label}</p>
            )}
            <div className="flex flex-col gap-1">
              {group.items.map((conversation) => (
                <ConversationRow
                  key={conversation.id}
                  conversation={conversation}
                  selected={conversation.id === selectedConversationId}
                  onSelect={onSelect}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: ConversationWithPreview;
  selected: boolean;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(conversation.id)}
      className={cn(
        "flex items-start gap-2 rounded-[var(--radius-control)] p-2 text-left",
        selected ? "rounded-l-none border-l-2 border-accent bg-surface-sunken" : "hover:bg-muted"
      )}
    >
      <span className="relative mt-0.5 shrink-0">
        <Falco pose="neutral" size="sm" />
        {!conversation.resolved && <span className="absolute top-0 right-0 size-2.5 rounded-full border-2 border-surface bg-accent" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm font-bold">{conversation.title}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{DATE_FORMAT.format(new Date(conversation.updatedAt))}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">{conversation.preview ? truncate(conversation.preview) : "Nouvelle conversation"}</span>
          <span className="shrink-0">· {conversation.messageCount} msg.</span>
        </span>
        <span className="block min-h-4 truncate text-[10px] font-bold text-accent-2-text">
          {conversation.insightDecision ? ACTION_LABELS[conversation.insightDecision] : "\u00a0"}
        </span>
      </span>
    </button>
  );
}
