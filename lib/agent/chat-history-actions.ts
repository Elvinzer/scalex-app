"use server";

import { clearAgentChatMessages, getAgentChatMessages, type StoredChatMessage } from "@/lib/agent/chat-history";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";

// Same permission gate as app/api/improve-chat/route.ts (the whole Copilote
// feature is gated by "diagnostic" uniformly, regardless of which specific
// topic/agent is open).
export async function loadAgentChatHistory(agentKey: string): Promise<StoredChatMessage[]> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return [];
  const access = await requirePermission(userId, "diagnostic");
  if (!access) return [];

  return getAgentChatMessages(access.accountId, agentKey);
}

export async function clearAgentChatHistory(agentKey: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "diagnostic");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await clearAgentChatMessages(access.accountId, agentKey);
  return { error: null };
}
