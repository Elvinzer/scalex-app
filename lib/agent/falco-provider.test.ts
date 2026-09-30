import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAiProvider: vi.fn(),
  tryDecrypt: vi.fn(() => null),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/ai-provider", () => ({ getAiProvider: mocks.getAiProvider }));
vi.mock("@/lib/crypto", () => ({ tryDecrypt: mocks.tryDecrypt }));
vi.mock("./quota", () => ({ checkAndIncrementSharedUsage: vi.fn() }));

import { resolveFalcoProvider, transformAnthropicStream, type FalcoUsage } from "./falco-provider";

afterEach(() => {
  delete process.env.ANTHROPIC_SHARED_API_KEY;
  mocks.getAiProvider.mockReset();
  mocks.tryDecrypt.mockReset();
  mocks.tryDecrypt.mockReturnValue(null);
});

beforeEach(() => {
  delete process.env.ANTHROPIC_SHARED_API_KEY;
});

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
    expect(output).toContain('"usage":{"inputTokens":12,"outputTokens":7}');
    expect(usage).toEqual({ inputTokens: 12, outputTokens: 7 });
  });
});

describe("Falco provider resolution", () => {
  it("falls back to the shared Groq provider when no Anthropic key exists", async () => {
    mocks.getAiProvider.mockReturnValue({
      apiKey: "groq-test-key-not-secret",
      baseURL: "https://example.test/v1/chat/completions",
      model: "test-groq-model",
    });

    const provider = await resolveFalcoProvider({ id: "user-id", anthropicApiKeyEncrypted: null });

    expect(provider).toEqual({
      kind: "groq",
      apiKey: "groq-test-key-not-secret",
      baseURL: "https://example.test/v1/chat/completions",
      model: "test-groq-model",
    });
    expect(mocks.getAiProvider).toHaveBeenCalledOnce();
  });
});
