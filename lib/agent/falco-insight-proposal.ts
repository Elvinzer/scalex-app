import { z } from "zod";

const EVENT_START = "[[FALCO_INSIGHT_EVENT]]";
const EVENT_END = "[[/FALCO_INSIGHT_EVENT]]";

const proposalSchema = z.object({
  kind: z.literal("proposal"),
  title: z.string().trim().min(1).max(120),
  problem: z.string().trim().min(1).max(800),
  actionText: z.string().trim().min(1).max(2000),
  successCriterion: z.string().trim().min(1).max(1000),
});

const vagueSchema = z.object({
  kind: z.literal("vague"),
  missing: z.string().trim().min(1).max(500),
  quickReplies: z.array(z.string().trim().min(1).max(80)).min(2).max(4),
});

export const falcoInsightEventSchema = z.discriminatedUnion("kind", [proposalSchema, vagueSchema]);
export const falcoInsightSseEnvelopeSchema = z.object({
  conversationId: z.string().uuid(),
  falcoInsightEvent: falcoInsightEventSchema,
});

export type FalcoInsightEvent = z.infer<typeof falcoInsightEventSchema>;
export type FalcoInsightSseEnvelope = z.infer<typeof falcoInsightSseEnvelopeSchema>;

export function parseFalcoInsightSseEnvelope(input: unknown, expectedConversationId: string): FalcoInsightEvent | null {
  const parsed = falcoInsightSseEnvelopeSchema.safeParse(input);
  return parsed.success && parsed.data.conversationId === expectedConversationId ? parsed.data.falcoInsightEvent : null;
}
export type FalcoInsightProposal = Extract<FalcoInsightEvent, { kind: "proposal" }>;
export type FalcoInsightVague = Extract<FalcoInsightEvent, { kind: "vague" }>;

const QUICK_REPLY_PLACEHOLDER = /\[\s*à\s+compléter\s*\]/iu;

export type FalcoQuickReplyAction =
  | { mode: "send"; text: string }
  | { mode: "compose"; text: string };

/**
 * Turns an incomplete suggested reply into an editable composer seed.
 * Complete suggestions keep the one-click send behavior.
 */
export function prepareFalcoQuickReply(value: string): FalcoQuickReplyAction {
  const trimmed = value.trim();
  if (!QUICK_REPLY_PLACEHOLDER.test(trimmed)) return { mode: "send", text: trimmed };

  const text = trimmed.replace(QUICK_REPLY_PLACEHOLDER, "").trimEnd();
  return { mode: "compose", text: text.length > 0 ? `${text} ` : "" };
}

export function extractFalcoInsightEvent(text: string): {
  visibleText: string;
  event: FalcoInsightEvent | null;
} {
  const start = text.indexOf(EVENT_START);
  if (start < 0) return { visibleText: text, event: null };

  const before = text.slice(0, start).trimEnd();
  const end = text.indexOf(EVENT_END, start + EVENT_START.length);
  if (end < 0) return { visibleText: before, event: null };

  const payload = text.slice(start + EVENT_START.length, end).trim();
  let candidate: unknown;
  try {
    candidate = JSON.parse(payload);
  } catch {
    candidate = null;
  }
  const parsed = falcoInsightEventSchema.safeParse(candidate);
  const after = text.slice(end + EVENT_END.length).trim();
  return {
    visibleText: [before, after].filter(Boolean).join("\n\n"),
    event: parsed.success ? parsed.data : null,
  };
}

export function removeFalcoInsightProtocol(text: string): string {
  const start = text.indexOf(EVENT_START);
  return start < 0 ? text : text.slice(0, start).trimEnd();
}

export const falcoInsightProtocol = {
  start: EVENT_START,
  end: EVENT_END,
};
