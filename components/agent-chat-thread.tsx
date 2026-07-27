"use client";

import { Send } from "lucide-react";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

import { Falco } from "@/components/falco/falco";
import { FalcoPondering } from "@/components/falco/falco-pondering";
import { Button } from "@/components/ui/button";
import { clearAgentChatHistory, loadAgentChatHistory } from "@/lib/agent/chat-history-actions";
import type { ChatContext } from "@/lib/chat-context";
import type { FalcoSkinKey } from "@/lib/falco-skins";

export type ChatMessage = { role: "user" | "assistant"; content: string; isError?: boolean };
type Period = "3-months" | "current-month" | "12-months";
type LeverMode = "optimiser" | "demarrer" | "decouverte";

export const MAX_MESSAGES = 20;

// Only bold and unordered lists are required (design system doc) — hand
// rolled rather than pulling in a markdown library for two constructs.
// Optionally turns an inter-agent redirect ("...le rayon de Falco Setter...")
// into a clickable chip — only when the caller (the Copilote page) supplies
// a name→agentKey lookup; the drawer never does, so its text stays exactly
// as before.
function renderMarkdownLite(
  text: string,
  redirect?: { agentNameToKey: Record<string, string>; onSelectAgent: (agentKey: string) => void }
) {
  const lines = text.split("\n");
  const nodes: React.ReactNode[] = [];
  let listBuffer: string[] = [];

  function flushList(key: string) {
    if (listBuffer.length === 0) return;
    nodes.push(
      <ul key={key} className="list-disc space-y-1 pl-5">
        {listBuffer.map((item, i) => (
          <li key={i}>{renderLine(item)}</li>
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

  function renderLine(line: string) {
    if (!redirect) return renderInline(line);
    const names = Object.keys(redirect.agentNameToKey);
    if (names.length === 0) return renderInline(line);
    const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const match = line.match(new RegExp(`rayon de (${escaped.join("|")})`));
    if (!match || match.index === undefined) return renderInline(line);

    const name = match[1];
    const agentKey = redirect.agentNameToKey[name];
    const before = line.slice(0, match.index);
    const after = line.slice(match.index + match[0].length);

    return (
      <>
        {renderInline(before)}
        rayon de{" "}
        <button
          type="button"
          onClick={() => redirect.onSelectAgent(agentKey)}
          className="inline rounded-full border border-border px-2 py-0.5 text-xs font-bold hover:bg-muted"
        >
          {name}
        </button>
        {renderInline(after)}
      </>
    );
  }

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      listBuffer.push(trimmed.slice(2));
    } else {
      flushList(`list-${index}`);
      if (trimmed.length > 0) {
        nodes.push(<p key={index}>{renderLine(line)}</p>);
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
    // Only supplied by the Copilote page — enables clickable inter-agent
    // redirect chips in assistant messages (see renderMarkdownLite above).
    agentNameToKey?: Record<string, string>;
    onSelectAgent?: (agentKey: string) => void;
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
>(function AgentChatThread({ context, followupKey, period, mode = null, falcoSkin, agentNameToKey, onSelectAgent, seedQuestion, onEngaged }, ref) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [failedHistory, setFailedHistory] = useState<ChatMessage[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasOpenedRef = useRef(false);
  // "metric" stays fully ephemeral (per-diagnostic-point drill-downs
  // elsewhere in the app) — "lever" and "general" both persist across opens
  // (the Copilote hub's whole premise is a durable thread per agent,
  // including the generalist one).
  const isPersisted = context.topicType !== "metric";
  const storageKey = context.topicKey ?? "general";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (hasOpenedRef.current) return;
    hasOpenedRef.current = true;

    if (isPersisted) {
      void (async () => {
        const history = await loadAgentChatHistory(storageKey);
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
      return;
    }

    void send(seedQuestion ? [{ role: "user", content: seedQuestion }] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-surface sync (drawer ↔ Copilote page) without a websocket: when
  // this tab regains focus/visibility, re-check the DB and adopt it if it
  // has grown — covers "sent a message in the drawer, it shows up here".
  useEffect(() => {
    if (!isPersisted) return;
    function handleVisible() {
      if (document.visibilityState !== "visible" || isStreaming) return;
      void (async () => {
        const history = await loadAgentChatHistory(storageKey);
        setMessages((prev) => (history.length > prev.length ? history : prev));
      })();
    }
    document.addEventListener("visibilitychange", handleVisible);
    window.addEventListener("focus", handleVisible);
    return () => {
      document.removeEventListener("visibilitychange", handleVisible);
      window.removeEventListener("focus", handleVisible);
    };
  }, [storageKey, isPersisted, isStreaming]);

  async function send(history: ChatMessage[]) {
    setIsStreaming(true);
    setMessages([...history, { role: "assistant", content: "" }]);

    try {
      const result = await streamChat({ context, followupKey, period, mode, messages: history }, (token) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + token };
          }
          return next;
        });
      });

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

  // Without this, once the 20 stored messages are reached a persisted
  // conversation would stay maxed out forever (persistence made the cap
  // permanent instead of per-open) — lets the user start over.
  async function handleNewConversation() {
    if (isStreaming) return;
    if (isPersisted) await clearAgentChatHistory(storageKey);
    setMessages([]);
    setFailedHistory(null);
    void send([]);
  }

  // Exposes reset to the header "Nouvelle conversation" button in
  // components/improve-chat.tsx (the drawer's chrome) — the message state
  // itself lives here, so the parent can't clear it directly.
  useImperativeHandle(ref, () => ({ reset: () => void handleNewConversation() }));

  const limitReached = messages.length >= MAX_MESSAGES;
  const redirect = agentNameToKey && onSelectAgent ? { agentNameToKey, onSelectAgent } : undefined;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-4">
          {messages.map((message, index) =>
            message.role === "user" ? (
              <div key={index} className="flex justify-end">
                <div className="max-w-[85%] rounded-[var(--radius-card)] bg-surface-sunken px-3 py-2 text-sm">
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
                <div className="flex flex-1 flex-col items-start gap-2">
                  <div className={`text-sm ${message.isError ? "text-state-critical" : "text-foreground"}`}>
                    {renderMarkdownLite(message.content, redirect)}
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
          <p className="font-bold text-accent-2-text">On a bien avancé — mets en place et reviens avec tes chiffres.</p>
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
