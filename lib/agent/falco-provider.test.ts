import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAiProvider: vi.fn(),
  tryDecrypt: vi.fn(() => null),
  entitlement: vi.fn(async () => ({ active: true })),
  recordUsage: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/ai-provider", () => ({ getAiProvider: mocks.getAiProvider }));
vi.mock("@/lib/crypto", () => ({ tryDecrypt: mocks.tryDecrypt }));
vi.mock("./quota", () => ({ checkAndIncrementSharedUsage: vi.fn() }));
vi.mock("@/lib/businesses/entitlements", () => ({ getBusinessEntitlement: mocks.entitlement }));
vi.mock("./usage", () => ({ recordAgentUsage: mocks.recordUsage }));

import { requestFalcoJson, requestFalcoStream, resolveFalcoProvider, transformAnthropicStream, type FalcoUsage } from "./falco-provider";

afterEach(() => {
  delete process.env.ANTHROPIC_SHARED_API_KEY;
  mocks.getAiProvider.mockReset();
  mocks.tryDecrypt.mockReset();
  mocks.tryDecrypt.mockReturnValue(null);
  mocks.recordUsage.mockReset();
  vi.unstubAllGlobals();
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

    const output = await readStream(transformAnthropicStream(source, (nextUsage) => { usage = nextUsage; }));

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
      businessId: "user-id",
    });
    expect(mocks.getAiProvider).toHaveBeenCalledOnce();
  });

  it("persists actual JSON usage against business and actor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: [], usage: { input_tokens: 31, output_tokens: 17 } }), { status: 200 })));
    const response = await requestFalcoJson({ kind: "anthropic", source: "byok", apiKey: "test-key", model: "test-model", businessId: "business-b", actorUserId: "actor", operation: "call-analysis" }, "system", "prompt", 0);
    expect(response.ok).toBe(true);
    expect(mocks.recordUsage).toHaveBeenCalledWith({ businessId: "business-b", actorUserId: "actor", keySource: "byok", operation: "call-analysis", inputTokens: 31, outputTokens: 17 });
  });

  it("persists streamed shared-provider usage after consumption", async () => {
    const stream = 'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[],"usage":{"prompt_tokens":42,"completion_tokens":8}}\n\ndata: [DONE]\n\n';
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, { status: 200 })));
    const response = await requestFalcoStream({ kind: "groq", apiKey: "test-key", baseURL: "https://provider.test", model: "test-model", businessId: "business-b", operation: "falco-chat" }, "system", [{ role: "user", content: "hello" }], undefined, "en");
    expect(await response.text()).toContain("Hello");
    expect(mocks.recordUsage).toHaveBeenCalledWith({ businessId: "business-b", actorUserId: undefined, keySource: "shared", operation: "falco-chat", inputTokens: 42, outputTokens: 8 });
  });
});
