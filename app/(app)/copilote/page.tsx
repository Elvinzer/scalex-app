import { after } from "next/server";

import { getConversations } from "@/lib/agent/chat-history";
import { track } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/current-user";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { CopilotePageClient } from "./copilote-page-client";

export default async function CopilotePage({ searchParams }: { searchParams: Promise<{ topic?: string; conversation?: string }> }) {
  const { userId, accountId } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "diagnostic");
  const params = await searchParams;

  after(() => track("copilote_page_viewed", userId));

  const conversations = await getConversations(accountId);

  return <CopilotePageClient conversations={conversations} initialTopicKey={params.topic ?? null} initialConversationId={params.conversation ?? null} />;
}
