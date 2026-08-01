"use server";

import {
  createConversation,
  findOrCreateConversationForTopic,
  getConversation,
  getConversationMessages,
  getConversations,
  type ConversationRow,
  type ConversationWithPreview,
  type StoredChatMessage,
} from "@/lib/agent/chat-history";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";

// Same permission gate as app/api/improve-chat/route.ts (the whole Copilote
// feature is gated by "diagnostic" uniformly, regardless of topic).

export async function listConversations(): Promise<ConversationWithPreview[]> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return [];
  const access = await requirePermission(userId, "diagnostic");
  if (!access) return [];

  return getConversations(access.accountId);
}

export async function loadConversationMessages(conversationId: string): Promise<StoredChatMessage[]> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return [];
  const access = await requirePermission(userId, "diagnostic");
  if (!access) return [];

  return getConversationMessages(access.accountId, conversationId);
}

// Always a brand new conversation — the Copilote hub's "+ Nouvelle
// conversation" and an in-thread "reset" both call this directly (never
// findOrCreate) since starting fresh is an explicit user action here, not
// an implicit resume.
export async function startNewConversation(
  topicType: "general" | "lever",
  topicKey: string | null,
  topicLabel: string | null
): Promise<ConversationRow | { error: string }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "diagnostic");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  return createConversation(access.accountId, { topicType, topicKey, topicLabel });
}

// Used by AgentChatThread for every entry point that only knows a
// ChatContext, not a conversation id (AgentBanner, the floating bubble,
// Découverte cards…) — resumes the most recent matching conversation or
// starts one, so these callers keep their existing "one continuous topic
// thread" feel without managing conversation ids themselves.
export async function resolveConversationForTopic(
  topicType: "general" | "lever",
  topicKey: string | null,
  topicLabel: string | null
): Promise<ConversationRow | { error: string }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "diagnostic");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  return findOrCreateConversationForTopic(access.accountId, { topicType, topicKey, topicLabel });
}

export async function getConversationById(conversationId: string): Promise<ConversationRow | null> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return null;
  const access = await requirePermission(userId, "diagnostic");
  if (!access) return null;

  return getConversation(access.accountId, conversationId);
}
