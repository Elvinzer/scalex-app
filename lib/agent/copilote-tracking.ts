"use server";

import { track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ? (data.claims.sub as string) : null;
}

export async function recordCopiloteConversationOpened(fromHistory: boolean): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await track("copilote_conversation_opened", userId, { from_history: fromHistory });
}

export async function recordCopiloteNewConversation(): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await track("copilote_new_conversation", userId);
}

export async function recordCopiloteTopic(topicKey: string | null): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await track("copilote_topic", userId, { topic_key: topicKey });
}
