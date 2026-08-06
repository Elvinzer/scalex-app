"use client";

import { Send } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { Falco } from "@/components/falco/falco";
import { FalcoPondering } from "@/components/falco/falco-pondering";
import { Button } from "@/components/ui/button";
import { loadConversationMessages, resolveConversationForTopic, startNewConversation } from "@/lib/agent/chat-history-actions";
import type { ConversationRow, ConversationTopicType } from "@/lib/agent/chat-history";
import type { ChatContext } from "@/lib/chat-context";
import type { FalcoSkinKey } from "@/lib/falco-skins";

export type ChatMessage = { role: "user" | "assistant"; content: string; isError?: boolean };
type Period = "3-months" | "current-month" | "12-months";
type LeverMode = "optimiser" | "demarrer" | "decouverte";

export const MAX_MESSAGES = 20;

function conversationTopicKeyForContext(context: ChatContext): string | null {
  // A general conversation opened from a page carries page-scoped numbers.
  // Keep it separate from the global Copilote thread so an old opening (for
  // example, from when YouTube had one video) cannot be mistaken for today's
  // page data on a later visit.
  if (context.topicType === "general" && context.sourcePage.startsWith("page_")) return context.sourcePage;
  return context.topicKey;
}

// Only bold and unordered lists are required (design system doc) — hand
// rolled rather than pulling in a markdown library for two constructs.
function renderMarkdownLite(text: string) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList(key: string) {
    if (listBuffer.length === 0) return;
    nodes.push(
      <ul key={key} className="list-disc space-y-1 pl-5">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </ul>
    );
    listBuffer = [];
  }

  function renderInline(line: string) {
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i} className="font-bold">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <span key={i}>{part}</span>
      )
    );
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      listBuffer.push(trimmed.slice(2));
    } else {
      flushList(`list-${index}`);
      if (trimmed.length > 0) {
        nodes.push(<p key={index}>{renderInline(line)}</p>);
      }
    }
  });
  flushList("list-end");

  return <div className="flex flex-col gap-2">{nodes}</div>;
}

// Two distinct deadlines, per the anti-hang requirement: CONNECT covers
// "the server never even starts responding" (fetch itself never
// resolves), STALL covers "the stream opened but then went silent
// mid-generation" (reader.read() never resolves again) — a single
// timeout on the whole call couldn't tell those apart, and a stream that
// legitimately runs longer than one fixed deadline would get killed for
// no reason. Every previous version of this function had NEITHER, which
// is why a stalled Groq connection left the UI stuck forever.
const CONNECT_TIMEOUT_MS = 20_000;
const STALL_TIMEOUT_MS = 20_000;

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number
): Promise<ReadableStreamReadResult<Uint8Array>> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("stall")), timeoutMs);
  });
  try {
    return await Promise.race([reader.read(), timeout]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

async function streamChat(
  body: {
    context: ChatContext;
    followupKey?: string | null;
    period: Period;
    mode?: LeverMode | null;
    conversationId?: string;
    messages: ChatMessage[];
  },
  onToken: (token: string) => void
): Promise<{ error: string | null }> {
  const controller = new AbortController();
  const connectTimeoutId = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("/api/improve-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return { error: "La connexion à l'IA a expiré. Réessaie." };
    }
    return { error: "Impossible de joindre le serveur. Vérifie ta connexion et réessaie." };
  } finally {
    clearTimeout(connectTimeoutId);
  }

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => null);
    return { error: data?.error ?? "L'IA n'a pas pu répondre. Réessaie dans un instant." };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await readWithTimeout(reader, STALL_TIMEOUT_MS);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const line = event.replace(/^data:\s*/, "").trim();
        if (!line || line === "[DONE]") continue;
        try {
          const json = JSON.parse(line);
          const token = json.choices?.[0]?.delta?.content;
          if (typeof token === "string") onToken(token);
        } catch {
          // Ignore malformed/partial SSE chunks — the next read() call
          // usually completes them.
        }
      }
    }
  } catch {
    void reader.cancel().catch(() => {});
    return { error: "La génération s'est interrompue. Réessaie." };
  }

  return { error: null };
}

// The reusable core of every agent conversation — message list, streaming,
// input, history persistence, the 20-message cap. Shared verbatim by the
// drawer (components/improve-chat.tsx, which only adds its own header/close
// chrome) and the Copilote hub page (components/copilote/copilote-chat-panel.tsx,
// which adds its own header + the agent panel alongside it). Never
// duplicate this logic elsewhere.
export type AgentChatThreadHandle = { reset: () => void };

export const AgentChatThread = forwardRef<
  AgentChatThreadHandle,
  {
    context: ChatContext;
    followupKey?: string | null;
    period: Period;
    mode?: LeverMode | null;
    falcoSkin?: FalcoSkinKey | null;
    // Only supplied by the Copilote hub, which displays the conversation
    // history and knows exactly which chapter is open. Every other caller
    // (AgentBanner on lever pages, the floating bubble, Découverte cards,
    // item-score-button) omits this — the thread resolves/creates the
    // right conversation for `context` itself on mount, same "one
    // continuous thread per topic" feel as before this chantier.
    conversationId?: string;
    // Fired whenever the active conversation changes (first resolved on
    // mount, or a brand new one after "Nouvelle conversation") — the FULL
    // row, not just the id, so the Copilote hub can prepend it to its
    // history list synchronously (no round-trip, no risk of the chat panel
    // briefly unmounting because the new id isn't in its list yet). Unused
    // (and harmless) for every other caller.
    onConversationChange?: (conversation: ConversationRow) => void;
    // A specific opening question to ask on top of whatever's already in the
    // thread (e.g. "pourquoi mon post X a un score de 62/100 ?") — used by
    // per-item score badges (posts-table.tsx/campaigns-table.tsx) that open
    // this SAME persisted lever thread rather than a one-off conversation.
    // Fires exactly once per mount, after history (if any) has loaded.
    seedQuestion?: string;
    // Fired once, the first time the user actually engages this session —
    // a real submitted message (handleSubmit) or a seedQuestion-triggered
    // send, never just viewing pre-existing history on mount or the
    // automatic opening greeting. Lets a container (e.g. the floating chat
    // bubble) warn before closing mid-conversation instead of silently
    // discarding the user's place in it.
    onEngaged?: () => void;
  }
>(function AgentChatThread(
  { context, followupKey, period, mode = null, falcoSkin, conversationId: explicitConversationId, onConversationChange, seedQuestion, onEngaged },
  ref
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [failedHistory, setFailedHistory] = useState<ChatMessage[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasOpenedRef = useRef(false);
  // "metric" stays fully ephemeral (per-diagnostic-point drill-downs
  // elsewhere in the app) — "lever" and "general" both persist across opens
  // (the Copilote hub's whole premise is a durable thread, including the
  // generalist one).
  const isPersisted = context.topicType !== "metric";
  const topicType: ConversationTopicType =
    context.topicType === "general" ? "general" : context.topicType === "lever" ? "lever" : "content_idea";
  const conversationTopicKey = conversationTopicKeyForContext(context);
  // Not React state: reassigned synchronously right after resolution so
  // `send`/`handleNewConversation` always read the current id without
  // waiting on a re-render. The Copilote hub, which DOES need a render on
  // change, is notified separately via onConversationChange.
  const conversationIdRef = useRef<string | null>(explicitConversationId ?? null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (hasOpenedRef.current) return;
    hasOpenedRef.current = true;

    if (!isPersisted) {
      void send(seedQuestion ? [{ role: "user", content: seedQuestion }] : []);
      return;
    }

    void (async () => {
      let id = conversationIdRef.current;
      if (!id) {
        const resolved = await resolveConversationForTopic(topicType, conversationTopicKey, context.topicLabel ?? null);
        if ("error" in resolved) {
          setMessages([{ role: "assistant", content: resolved.error, isError: true }]);
          return;
        }
        id = resolved.id;
        conversationIdRef.current = id;
        onConversationChange?.(resolved);
      }

      const history = await loadConversationMessages(id);
      if (seedQuestion) {
        onEngaged?.();
        setMessages(history);
        void send([...history, { role: "user", content: seedQuestion }]);
      } else if (history.length > 0) {
        setMessages(history);
      } else {
        void send([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-surface sync (drawer ↔ Copilote page) without a websocket: when
  // this tab regains focus/visibility, re-check the DB and adopt it if it
  // has grown — covers "sent a message in the drawer, it shows up here".
  useEffect(() => {
    if (!isPersisted) return;
    function handleVisible() {
      if (document.visibilityState !== "visible" || isStreaming) return;
      const id = conversationIdRef.current;
      if (!id) return;
      void (async () => {
        const history = await loadConversationMessages(id);
        setMessages((prev) => (history.length > prev.length ? history : prev));
      })();
    }
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleVisible);
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleVisible);
    };
  }, [isPersisted, isStreaming]);

  async function send(history: ChatMessage[]) {
    setIsStreaming(true);
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const result = await streamChat(
        { context, followupKey, period, mode, conversationId: conversationIdRef.current ?? undefined, messages: history },
        (token) => {
          setMessages((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === "assistant") {
              next[next.length - 1] = { ...last, content: last.content + token };
            }
            return next;
          });
        }
      );

      if (result.error) {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: "assistant", content: result.error!, isError: true };
          return next;
        });
        setFailedHistory(history);
      } else {
        setFailedHistory(null);
      }
    } catch {
      // streamChat itself is expected to always resolve (never throw) —
      // this only guards against something unexpected slipping through,
      // so `finally` below is still what actually prevents an infinite
      // spinner; without it, a thrown rejection here used to leave
      // isStreaming stuck true forever (the classic missing-finally bug).
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { role: "assistant", content: "Une erreur inattendue s'est produite. Réessaie.", isError: true };
        return next;
      });
      setFailedHistory(history);
    } finally {
      setIsStreaming(false);
    }
  }

  function retry() {
    if (!failedHistory || isStreaming) return;
    void send(failedHistory);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    const nextHistory: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setInput("");
    onEngaged?.();
    void send(nextHistory);
  }

  // Starts a genuinely NEW conversation and switches to it — never clears
  // the current one in place, so nothing already in history is lost (also
  // fixes the old "20-message cap becomes permanent" bug, since a fresh
  // conversation naturally has its own cap).
  async function handleNewConversation() {
    if (isStreaming) return;
    if (isPersisted) {
      const created = await startNewConversation(topicType, conversationTopicKey, context.topicLabel ?? null);
      if ("error" in created) {
        setMessages([{ role: "assistant", content: created.error, isError: true }]);
        return;
      }
      conversationIdRef.current = created.id;
      onConversationChange?.(created);
    }
    setMessages([]);
    setFailedHistory(null);
    void send([]);
  }

  // Exposes reset to the header "Nouvelle conversation" button in
  // components/improve-chat.tsx (the drawer's chrome) — the message state
  // itself lives here, so the parent can't clear it directly.
  useImperativeHandle(ref, () => ({ reset: () => void handleNewConversation() }));

  const limitReached = messages.length >= MAX_MESSAGES;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {messages.map((message, index) =>
            message.role === "user" ? (
              <div key={index} className="flex justify-end">
                <div className="max-w-[85%] rounded-[var(--radius-card)] bg-surface-sunken px-3 py-2 text-sm break-words">
                  {message.content}
                </div>
              </div>
            ) : message.content ? (
              <div key={index} className="flex gap-2">
                {falcoSkin ? (
                  <Falco skin={falcoSkin} portrait skinSizePx={24} className="mt-0.5 rounded-full" />
                ) : (
                  <Falco pose="neutral" size="xs" className="mt-0.5" />
                )}
                <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                  <div className={`text-sm break-words ${message.isError ? "text-state-critical" : "text-foreground"}`}>
                    {renderMarkdownLite(message.content)}
                  </div>
                  {message.isError && index === messages.length - 1 && !isStreaming && (
                    <Button size="sm" variant="outline" onClick={retry}>
                      Réessayer
                    </Button>
                  )}
                </div>
              </div>
            ) : isStreaming && index === messages.length - 1 ? (
              <FalcoPondering key={index} isLoading size="xs" />
            ) : null
          )}
        </div>
      </div>

      {limitReached && (
        <div className="mx-4 mb-3 flex items-center justify-between gap-3 rounded-[var(--radius-card)] bg-accent-2-soft px-4 py-3 text-sm">
          <p className="font-bold text-accent-2-text">On a bien avancé. Mets en place et reviens avec tes chiffres.</p>
          <Button size="sm" variant="outline" onClick={() => void handleNewConversation()}>
            Recommencer à zéro
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t border-border p-4">
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={isStreaming || limitReached}
          placeholder={limitReached ? "Limite de messages atteinte" : "Écris ton message..."}
          className="flex-1 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isStreaming || limitReached || input.trim().length === 0}
          className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-2 text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-accent-2-hover disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
});
