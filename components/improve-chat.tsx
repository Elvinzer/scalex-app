"use client";

import { Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Falco } from "@/components/falco/falco";
import { DrawerClose, DrawerTitle } from "@/components/ui/drawer";
import type { ImproveMetricKey } from "@/lib/improve-prompt-builder";

type ChatMessage = { role: "user" | "assistant"; content: string };
type Period = "3-months" | "current-month" | "12-months";

const MAX_MESSAGES = 20;

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

async function streamChat(
  body: {
    metricKey: ImproveMetricKey;
    followupKey?: string | null;
    period: Period;
    messages: ChatMessage[];
  },
  onToken: (token: string) => void
): Promise<{ error: string | null }> {
  const response = await fetch("/api/improve-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => null);
    return { error: data?.error ?? "L'IA n'a pas pu répondre — réessaie dans un instant." };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
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

  return { error: null };
}

export function ImproveChat({
  metricKey,
  followupKey,
  period,
  title,
  gapBadge,
}: {
  metricKey: ImproveMetricKey;
  followupKey?: string | null;
  period: Period;
  title: string;
  gapBadge: string | null;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasOpenedRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (hasOpenedRef.current) return;
    hasOpenedRef.current = true;
    void send([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(history: ChatMessage[]) {
    setIsStreaming(true);
    setMessages([...history, { role: "assistant", content: "" }]);

    const result = await streamChat({ metricKey, followupKey, period, messages: history }, (token) => {
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
        next[next.length - 1] = { role: "assistant", content: result.error! };
        return next;
      });
    }
    setIsStreaming(false);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    const nextHistory: ChatMessage[] = [...messages, { role: "user", content: trimmed }];
    setInput("");
    void send(nextHistory);
  }

  const limitReached = messages.length >= MAX_MESSAGES;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-border p-4">
        <div className="flex items-start gap-3">
          <Falco pose="neutral" size="sm" />
          <div>
            <DrawerTitle className="text-base font-bold">Améliorer : {title}</DrawerTitle>
            {gapBadge && (
              <span className="mt-1 inline-flex rounded-[var(--radius-control)] bg-accent-soft px-2 py-0.5 text-xs font-bold text-accent-text">
                {gapBadge}
              </span>
            )}
          </div>
        </div>
        <DrawerClose className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted">
          <X className="size-4" />
        </DrawerClose>
      </div>

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
                <Falco pose="neutral" size="xs" className="mt-0.5" />
                <div className="flex-1 text-sm text-foreground">{renderMarkdownLite(message.content)}</div>
              </div>
            ) : isStreaming && index === messages.length - 1 ? (
              <div key={index} className="flex items-center gap-2">
                <Falco pose="thinking" size="xs" />
                <span className="text-sm text-muted-foreground">Falco réfléchit…</span>
              </div>
            ) : null
          )}
        </div>
      </div>

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
          className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent text-white transition-colors duration-[var(--motion-fast)] ease-[var(--ease-out)] hover:bg-accent-hover disabled:opacity-50"
        >
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
