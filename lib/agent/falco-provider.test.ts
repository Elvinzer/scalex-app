import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { transformAnthropicStream, type FalcoUsage } from "./falco-provider";

async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let output = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return output;
    output += decoder.decode(value, { stream: true });
  }
}

describe("Falco provider stream", () => {
  it("converts Anthropic text deltas to the SSE shape used by the chat client", async () => {
    const encoder = new TextEncoder();
    const anthropicEvents = [
      `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 12 } } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Bonjour" } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: " Falco" } })}\n\n`,
      `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 7 } })}\n\n`,
      `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
    ].join("");
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(anthropicEvents.slice(0, 41)));
        controller.enqueue(encoder.encode(anthropicEvents.slice(41)));
        controller.close();
      },
    });
    let usage: FalcoUsage | null = null;

    const output = await readStream(transformAnthropicStream(source, (nextUsage) => (usage = nextUsage)));

    expect(output).toContain('"content":"Bonjour"');
    expect(output).toContain('"content":" Falco"');
    expect(output).toContain("data: [DONE]");
    expect(usage).toEqual({ inputTokens: 12, outputTokens: 7 });
  });
});
