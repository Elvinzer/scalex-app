import { describe, expect, it } from "vitest";

import { extractFalcoInsightEvent, falcoInsightProtocol } from "./falco-insight-proposal";
import { createSseAccumulatorStream } from "./sse-accumulator";

describe("SSE accumulator", () => {
  it("keeps the assistant text and emits a validated event after completion", async () => {
    let completed = "";
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Bonjour"}}]}\n\n'));
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":" Falco"}}]}\n\ndata: [DONE]\n\n'));
        controller.close();
      },
    });

    const body = input.pipeThrough(
      createSseAccumulatorStream((fullText) => {
        completed = fullText;
        return { kind: "vague", missing: "Précise le moment.", quickReplies: ["Après 2 échanges", "Quand il demande"] };
      }, { conversationId: "00000000-0000-0000-0000-000000000001" }),
    );
    const output = await new Response(body).text();

    expect(completed).toBe("Bonjour Falco");
    expect(output).toContain('"falcoInsightEvent":{"kind":"vague"');
    expect(output).toContain('"conversationId":"00000000-0000-0000-0000-000000000001"');
  });

  it("does not emit an event when the upstream response is absent or interrupted", async () => {
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`data: {"choices":[{"delta":{"content":"Texte ${falcoInsightProtocol.start}{"}}]}\n\n`));
        controller.close();
      },
    });

    const body = input.pipeThrough(
      createSseAccumulatorStream((fullText) => extractFalcoInsightEvent(fullText).event, {
        conversationId: "00000000-0000-0000-0000-000000000001",
      }),
    );
    const output = await new Response(body).text();

    expect(output).not.toContain("falcoInsightEvent");
  });
});
