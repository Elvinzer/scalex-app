import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { agentChatMessages } from "@/db/schema";

export const MAX_AGENT_MESSAGES = 20;

export type StoredChatMessage = { role: "user" | "assistant"; content: string };

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
