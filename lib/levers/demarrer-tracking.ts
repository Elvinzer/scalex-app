"use server";

import { track } from "@/lib/analytics";
import { createClient } from "@/lib/supabase/server";

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return data?.claims ? (data.claims.sub as string) : null;
}

export async function recordLeverVideoClicked(leverKey: string, videoTitle: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await track("lever_video_clicked", userId, { lever_key: leverKey, video: videoTitle });
}

export async function recordLeverGuideChatOpened(leverKey: string, fromStep: number | null): Promise<void> {
  const userId = await currentUserId();
  if (!userId) return;
  await track("lever_guide_chat_opened", userId, { lever_key: leverKey, from_step: fromStep });
}
