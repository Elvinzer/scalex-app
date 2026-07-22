import { z } from "zod";

// Shared front/back contract for the Copilote's "Améliorer" chat
// (components/improve-chat.tsx, app/api/improve-chat/route.ts). Every
// opener MUST build one of these — no drawer opens "nu" (naked) without a
// topic, per the fix for the generic-response bug: a missing/invalid
// context is a rejected request server-side, never a silent fallback to
// "general" (see app/api/improve-chat/route.ts).
//
// Deliberately NOT shared with the ad-copy chat or the call-analysis chat
// (components/ad-copy-chat.tsx, components/call-analysis-chat.tsx) — those
// are separate, already-correctly-scoped implementations with their own
// prompt builders and request shapes; unifying them isn't part of this fix.
export const CHAT_TOPIC_TYPES = ["metric", "lever", "general"] as const;
export type ChatTopicType = (typeof CHAT_TOPIC_TYPES)[number];

export type ChatContext = {
  topicType: ChatTopicType;
  // MetricKey | "followupRecovery" | leverKey — null only for "general".
  topicKey: string | null;
  // Human-readable label shown in the drawer header ("Améliorer : {topicLabel}")
  // — null only for "general" (shows "Copilote" instead, no fake topic).
  topicLabel: string | null;
  // Where the chat was opened from — for tracking (improve_chat_opened).
  sourcePage: string;
};

export const chatContextSchema = z.object({
  topicType: z.enum(CHAT_TOPIC_TYPES),
  topicKey: z.string().nullable(),
  topicLabel: z.string().nullable(),
  sourcePage: z.string(),
});
