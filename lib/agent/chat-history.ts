import { and, asc, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { agentChatMessages } from "@/db/schema";

export const MAX_AGENT_MESSAGES = 20;

export type StoredChatMessage = { role: "user" | "assistant"; content: string };
export type LastMessagePreview = { content: string; createdAt: string };

// Ordered oldest-first, capped at MAX_AGENT_MESSAGES — the route's own
// "conversation full" check already stops new sends once this cap is hit,
// so nothing here ever needs to prune older rows.
export async function getAgentChatMessages(accountId: string, agentKey: string): Promise<StoredChatMessage[]> {
  const rows = await db
    .select({ role: agentChatMessages.role, content: agentChatMessages.content })
    .from(agentChatMessages)
    .where(and(eq(agentChatMessages.userId, accountId), eq(agentChatMessages.agentKey, agentKey)))
    .orderBy(asc(agentChatMessages.createdAt))
    .limit(MAX_AGENT_MESSAGES);

  return rows.map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
}

export async function appendAgentChatMessage(
  accountId: string,
  agentKey: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await db.insert(agentChatMessages).values({ userId: accountId, agentKey, role, content });
}

export async function clearAgentChatMessages(accountId: string, agentKey: string): Promise<void> {
  await db.delete(agentChatMessages).where(and(eq(agentChatMessages.userId, accountId), eq(agentChatMessages.agentKey, agentKey)));
}

// One row per agent_key (its most recent message) — powers the Copilote
// hub panel's 1-line preview. Fetches every message for the account
// ordered newest-first and reduces to the first occurrence per agentKey in
// JS: at most 8 agents × 20 messages = 160 rows, not worth a DISTINCT ON.
export async function getLastMessagesByAgent(accountId: string): Promise<Record<string, LastMessagePreview>> {
  const rows = await db
    .select({ agentKey: agentChatMessages.agentKey, content: agentChatMessages.content, createdAt: agentChatMessages.createdAt })
    .from(agentChatMessages)
    .where(eq(agentChatMessages.userId, accountId))
    .orderBy(desc(agentChatMessages.createdAt));

  const result: Record<string, LastMessagePreview> = {};
  for (const row of rows) {
    if (result[row.agentKey]) continue;
    result[row.agentKey] = { content: row.content, createdAt: row.createdAt.toISOString() };
  }
  return result;
}
