"use server";

import { track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ? (data.claims.sub as string) : null;
}

export async function recordCopiloteAgentSelected(agentKey: string, hasHistory: boolean): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await track("copilote_agent_selected", userId, { agent_key: agentKey, has_history: hasHistory });
}

export async function recordCopiloteSwitchFromRedirect(from: string, to: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await track("copilote_switch_from_redirect", userId, { from, to });
}
