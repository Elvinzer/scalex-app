import { describe, expect, it } from "vitest";

import { parseFalcoCallMatchResponse } from "./call-matching-schemas";

const leadId = "11111111-1111-4111-8111-111111111111";

function envelope(result: unknown, usage: Record<string, number> = { input_tokens: 12, output_tokens: 7 }): unknown {
  return { content: [{ type: "text", text: JSON.stringify(result) }], usage };
}

describe("Falco CRM call matching response", () => {
  it("parses a bounded candidate response and provider usage", () => {
    const parsed = parseFalcoCallMatchResponse(envelope({
      status: "candidate",
      confidence: "medium",
      candidates: [{ leadId, confidence: "medium", reasonCodes: ["name_match", "time_proximity"], reasons: ["Nom et date proches"], missingEvidence: ["email"] }],
    }));

    expect(parsed).toMatchObject({ inputTokens: 12, outputTokens: 7, result: { status: "candidate", candidates: [{ leadId }] } });
  });

  it("accepts fenced JSON and OpenAI-compatible usage fields", () => {
    const parsed = parseFalcoCallMatchResponse({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify({ status: "no_match", confidence: null, candidates: [] })}\n\`\`\`` } }], usage: { prompt_tokens: 4, completion_tokens: 2 } });

    expect(parsed).toMatchObject({ inputTokens: 4, outputTokens: 2, result: { status: "no_match", candidates: [] } });
  });

  it("rejects malformed responses, invalid IDs and unknown reason codes", () => {
    expect(parseFalcoCallMatchResponse({ content: [{ text: "not json" }] })).toBeNull();
    expect(parseFalcoCallMatchResponse(envelope({ status: "candidate", candidates: [{ leadId: "not-an-id" }] }))).toBeNull();
    expect(parseFalcoCallMatchResponse(envelope({ status: "candidate", candidates: [{ leadId, reasonCodes: ["invented_reason"] }] }))).toBeNull();
  });

  it("rejects more than the three candidates the UI can review", () => {
    const candidates = [1, 2, 3, 4].map((index) => ({ leadId: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`, confidence: "low", reasonCodes: [], reasons: [], missingEvidence: [] }));
    expect(parseFalcoCallMatchResponse(envelope({ status: "ambiguous", confidence: "low", candidates }))).toBeNull();
  });
});
