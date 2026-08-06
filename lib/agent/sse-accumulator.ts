// Tees an OpenAI-compatible SSE stream: forwards every chunk to the client byte-for-byte
// (unchanged), while separately parsing the same "data: {...}" lines to
// accumulate the assembled assistant reply — same parsing logic as
// components/improve-chat.tsx's client-side streamChat, duplicated here
// because this runs server-side on the raw upstream Response body, which
// the client never sees pre-parsed. Used only to persist lever-agent
// conversations (app/api/improve-chat/route.ts); the metric/general path
// stays a plain passthrough, untouched.
export function createSseAccumulatorStream(onComplete: (fullText: string) => void | Promise<void>): TransformStream<Uint8Array, Uint8Array> {
  const decoder = new TextDecoder();
  let buffer = "";
  let assistantText = "";

  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      buffer += decoder.decode(chunk, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const line = event.replace(/^data:\s*/, "").trim();
        if (!line || line === "[DONE]") continue;
        try {
          const json = JSON.parse(line);
          const token = json.choices?.[0]?.delta?.content;
          if (typeof token === "string") assistantText += token;
        } catch {
          // Ignore malformed/partial SSE chunks — same tolerance as the
          // client-side parser, the next chunk usually completes them.
        }
      }
    },
    async flush() {
      await onComplete(assistantText);
    },
  });
}
