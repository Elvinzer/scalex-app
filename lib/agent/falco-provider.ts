import { z } from "zod";

import { getAiProvider } from "@/lib/ai-provider";

import { NoAgentKeyAvailableError, resolveAgentKey, type AgentKey } from "./client";

const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929";
const ANTHROPIC_VERSION = "2023-06-01";
const CONNECT_TIMEOUT_MS = 20_000;

type FalcoMessage = { role: "user" | "assistant"; content: string };

export type FalcoProvider =
  | { kind: "anthropic"; source: AgentKey["source"]; apiKey: string; model: string }
  | { kind: "groq"; apiKey: string; baseURL: string; model: string };

export type FalcoUsage = { inputTokens: number; outputTokens: number };

const usageSchema = z.object({
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
});

const anthropicStreamEventSchema = z.object({
  type: z.string(),
  delta: z
    .object({
      type: z.string().optional(),
      text: z.string().optional(),
    })
    .optional(),
  message: z.object({ usage: usageSchema.optional() }).optional(),
  usage: usageSchema.optional(),
});

export async function resolveFalcoProvider(user: {
  id: string;
  anthropicApiKeyEncrypted: string | null;
}): Promise<FalcoProvider> {
  try {
    const agentKey = await resolveAgentKey(user);
    return { kind: "anthropic", source: agentKey.source, apiKey: agentKey.apiKey, model: ANTHROPIC_MODEL };
  } catch (error) {
    if (!(error instanceof NoAgentKeyAvailableError)) throw error;
  }

  const groq = getAiProvider();
  return { kind: "groq", apiKey: groq.apiKey, baseURL: groq.baseURL, model: groq.model };
}

export async function requestFalcoStream(
  provider: FalcoProvider,
  systemPrompt: string,
  messages: FalcoMessage[],
  temperature: number | null | undefined
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
  const safeTemperature = typeof temperature === "number" ? temperature : undefined;
  const effectiveMessages =
    messages.length > 0 ? messages : [{ role: "user" as const, content: "Commence par ton message d'ouverture." }];

  try {
    if (provider.kind === "anthropic") {
      return await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "x-api-key": provider.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: 1024,
          system: systemPrompt,
          ...(safeTemperature === undefined ? {} : { temperature: safeTemperature }),
          stream: true,
          messages: effectiveMessages,
        }),
        signal: controller.signal,
      });
    }

    return await fetch(provider.baseURL, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        stream: true,
        ...(safeTemperature === undefined ? {} : { temperature: safeTemperature }),
        messages: [{ role: "system", content: systemPrompt }, ...effectiveMessages],
      }),
      signal: controller.signal,
    });
  } finally {
    // The timeout protects connection establishment only. Once headers arrive,
    // the client-side stall timeout is responsible for a stream that pauses.
    clearTimeout(timeoutId);
  }
}

export async function requestFalcoJson(
  provider: FalcoProvider,
  systemPrompt: string,
  prompt: string,
  temperature: number | null | undefined,
  maxTokens = 4096
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
  const safeTemperature = typeof temperature === "number" ? temperature : undefined;

  try {
    if (provider.kind === "anthropic") {
      return await fetch(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "x-api-key": provider.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          max_tokens: maxTokens,
          system: systemPrompt,
          ...(safeTemperature === undefined ? {} : { temperature: safeTemperature }),
          messages: [{ role: "user", content: prompt }],
        }),
        signal: controller.signal,
      });
    }

    return await fetch(provider.baseURL, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        ...(safeTemperature === undefined ? {} : { temperature: safeTemperature }),
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export function transformAnthropicStream(
  body: ReadableStream<Uint8Array>,
  onUsage: (usage: FalcoUsage) => void
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let sentDone = false;

  function emitEvent(rawEvent: string, controller: TransformStreamDefaultController<Uint8Array>) {
    const dataLine = rawEvent
      .split("\n")
      .find((line) => line.startsWith("data:"))
      ?.slice("data:".length)
      .trim();
    if (!dataLine || dataLine === "[DONE]") return;

    let json: unknown;
    try {
      json = JSON.parse(dataLine);
    } catch {
      return;
    }
    const parsed = anthropicStreamEventSchema.safeParse(json);
    if (!parsed.success) return;

    inputTokens = parsed.data.message?.usage?.input_tokens ?? inputTokens;
    outputTokens = parsed.data.usage?.output_tokens ?? outputTokens;

    if (parsed.data.type === "content_block_delta" && parsed.data.delta?.type === "text_delta" && parsed.data.delta.text) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: parsed.data.delta.text }, finish_reason: null }] })}\n\n`
        )
      );
    }

    if (parsed.data.type === "message_stop" && !sentDone) {
      sentDone = true;
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    }
  }

  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const event of events) emitEvent(event, controller);
      },
      flush(controller) {
        const finalBuffer = buffer.trim();
        if (finalBuffer) emitEvent(finalBuffer, controller);
        if (!sentDone) controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        const usage = { inputTokens, outputTokens };
        onUsage(usage);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ usage })}\n\n`));
      },
    })
  );
}
