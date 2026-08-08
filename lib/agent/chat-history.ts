import { and, count, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { agentChatMessages, conversations, insightRecords } from "@/db/schema";
import type { InsightDecision } from "@/lib/insight-execution/types";

export const MAX_AGENT_MESSAGES = 20;

export type StoredChatMessage = { role: "user" | "assistant"; content: string };
export type ConversationTopicType = "general" | "lever" | "content_idea";

export type ConversationRow = {
  id: string;
  title: string;
  topicType: ConversationTopicType;
  topicKey: string | null;
  topicLabel: string | null;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConversationWithPreview = ConversationRow & {
  preview: string | null;
  messageCount: number;
  insightId: string | null;
  insightDecision: InsightDecision | null;
};

function toRow(row: typeof conversations.$inferSelect): ConversationRow {
  return {
    id: row.id,
    title: row.title,
    topicType: row.topicType,
    topicKey: row.topicKey,
    topicLabel: row.topicLabel,
    resolved: row.resolved,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

// Deterministic, no AI call — same reliability-over-cleverness rule already
// applied to lib/diagnostic/lever-advice.ts's conseils. Cited by the plan as
// "chapter title": topic + a snippet of what the user actually asked, not a
// generic label alone once there's something real to summarize.
export function titleFor(topicLabel: string | null, firstUserMessage: string | null): string {
  if (topicLabel && firstUserMessage) return `${topicLabel} — ${truncate(firstUserMessage, 40)}`;
  if (topicLabel) return topicLabel;
  if (firstUserMessage) return truncate(firstUserMessage, 60);
  return "Nouvelle conversation";
}

// History panel list — one row per conversation, newest-first, with a
// 1-line preview of the last message. Small volume per user (no pruning
// exists yet), so a second query + JS reduce is simpler than a lateral
// join, same reasoning as the old getLastMessagesByAgent.
export async function getConversations(accountId: string): Promise<ConversationWithPreview[]> {
  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.userId, accountId))
    .orderBy(desc(conversations.updatedAt));

  if (convRows.length === 0) return [];

  const [messageRows, countRows, insightRows] = await Promise.all([
    db
      .select({ conversationId: agentChatMessages.conversationId, content: agentChatMessages.content })
      .from(agentChatMessages)
      .where(eq(agentChatMessages.userId, accountId))
      .orderBy(desc(agentChatMessages.createdAt)),
    db
      .select({ conversationId: agentChatMessages.conversationId, messageCount: count() })
      .from(agentChatMessages)
      .where(eq(agentChatMessages.userId, accountId))
      .groupBy(agentChatMessages.conversationId),
    db
      .select({ id: insightRecords.id, sourceId: insightRecords.sourceId, decision: insightRecords.decision })
      .from(insightRecords)
      .where(and(eq(insightRecords.userId, accountId), eq(insightRecords.sourceType, "copilote"))),
  ]);
  const lastMessageByConversation = new Map<string, string>();
  for (const row of messageRows) {
    if (lastMessageByConversation.has(row.conversationId)) continue;
    lastMessageByConversation.set(row.conversationId, row.content);
  }

  const countByConversation = new Map(countRows.map((row) => [row.conversationId, Number(row.messageCount)]));
  const insightByConversation = new Map(insightRows.map((row) => [row.sourceId, { id: row.id, decision: row.decision }]));

  return convRows.map((row) => {
    const insight = insightByConversation.get(row.id);
    return {
      ...toRow(row),
      preview: lastMessageByConversation.get(row.id) ?? null,
      messageCount: countByConversation.get(row.id) ?? 0,
      insightId: insight?.id ?? null,
      insightDecision: insight?.decision ?? null,
    };
  });
}

export async function getConversation(accountId: string, id: string): Promise<ConversationRow | null> {
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, accountId)))
    .limit(1);
  return row ? toRow(row) : null;
}

export async function getConversationMessages(accountId: string, conversationId: string): Promise<StoredChatMessage[]> {
  const rows = await db
    .select({ role: agentChatMessages.role, content: agentChatMessages.content })
    .from(agentChatMessages)
    .where(and(eq(agentChatMessages.userId, accountId), eq(agentChatMessages.conversationId, conversationId)))
    .orderBy(agentChatMessages.createdAt)
    .limit(MAX_AGENT_MESSAGES);

  return rows.map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
}

// Always creates a brand new row (client-generated id or a fresh one) —
// used by the Copilote hub's "+ Nouvelle conversation" and by
// findOrCreateConversationForTopic below when no match exists yet.
export async function createConversation(
  accountId: string,
  data: { id?: string; topicType: ConversationTopicType; topicKey: string | null; topicLabel: string | null }
): Promise<ConversationRow> {
  const [row] = await db
    .insert(conversations)
    .values({
      ...(data.id ? { id: data.id } : {}),
      userId: accountId,
      title: titleFor(data.topicLabel, null),
      topicType: data.topicType,
      topicKey: data.topicKey,
      topicLabel: data.topicLabel,
    })
    .returning();
  return toRow(row);
}

// The ~15 existing entry points (AgentBanner, floating bubble, Découverte
// cards…) never pass a conversationId — they only know a ChatContext. This
// resumes whichever conversation was most recently active on that exact
// topic (or the most recently active GENERAL conversation, for the
// floating bubble/Copilote's own "Copilote" item — topicKey is null for
// both, so they naturally share one), or starts a fresh one on first use.
// Preserves today's "one continuous thread per topic" feel for every
// caller that doesn't explicitly manage conversations itself.
export async function findOrCreateConversationForTopic(
  accountId: string,
  topic: { topicType: ConversationTopicType; topicKey: string | null; topicLabel: string | null }
): Promise<ConversationRow> {
  const [existing] = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, accountId),
        eq(conversations.topicType, topic.topicType),
        topic.topicKey === null ? isNull(conversations.topicKey) : eq(conversations.topicKey, topic.topicKey)
      )
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(1);

  if (existing) return toRow(existing);
  return createConversation(accountId, topic);
}

export async function appendConversationMessage(
  accountId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(agentChatMessages).values({ userId: accountId, conversationId, agentKey: "falco", role, content });
    await tx.update(conversations).set({ updatedAt: new Date() }).where(eq(conversations.id, conversationId));
  });
}

export async function updateConversationTitle(accountId: string, conversationId: string, title: string): Promise<void> {
  await db
    .update(conversations)
    .set({ title })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, accountId)));
}
