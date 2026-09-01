import { z } from "zod";

import { CRM_CALL_MATCH_CONFIDENCES, CRM_CALL_MATCH_REASON_CODES } from "./types";

const confidenceSchema = z.enum(CRM_CALL_MATCH_CONFIDENCES);
const reasonCodeSchema = z.enum(CRM_CALL_MATCH_REASON_CODES);

const falcoCandidateSchema = z.object({
  leadId: z.string().uuid(),
  confidence: confidenceSchema.default("low"),
  reasonCodes: z.array(reasonCodeSchema).max(8).default([]),
  reasons: z.array(z.string().trim().min(1).max(180)).max(5).default([]),
  missingEvidence: z.array(z.string().trim().min(1).max(80)).max(6).default([]),
});

export const falcoCallMatchResponseSchema = z.object({
  status: z.enum(["candidate", "ambiguous", "no_match", "unavailable"]),
  confidence: confidenceSchema.nullable().default(null),
  candidates: z.array(falcoCandidateSchema).max(3).default([]),
});

const responseEnvelopeSchema = z
  .object({
    content: z.array(z.object({ text: z.string().optional() }).passthrough()).optional(),
    choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }).optional() }).passthrough()).optional(),
    usage: z
      .object({
        input_tokens: z.number().int().nonnegative().optional(),
        output_tokens: z.number().int().nonnegative().optional(),
        prompt_tokens: z.number().int().nonnegative().optional(),
        completion_tokens: z.number().int().nonnegative().optional(),
      })
      .optional(),
  })
  .passthrough();

export type FalcoCallMatchResponse = z.infer<typeof falcoCallMatchResponseSchema>;

export type ParsedFalcoCallMatchResponse = {
  result: FalcoCallMatchResponse;
  inputTokens: number;
  outputTokens: number;
};

function cleanJsonText(value: string): string {
  return value.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export function parseFalcoCallMatchResponse(raw: unknown): ParsedFalcoCallMatchResponse | null {
  const envelope = responseEnvelopeSchema.safeParse(raw);
  if (!envelope.success) return null;
  const text = envelope.data.content?.find((block) => block.text)?.text
    ?? envelope.data.choices?.find((choice) => choice.message?.content)?.message?.content
    ?? null;
  if (!text) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(cleanJsonText(text)) as unknown;
  } catch {
    return null;
  }
  const result = falcoCallMatchResponseSchema.safeParse(decoded);
  if (!result.success) return null;
  const usage = envelope.data.usage;
  return {
    result: result.data,
    inputTokens: usage?.input_tokens ?? usage?.prompt_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? usage?.completion_tokens ?? 0,
  };
}
