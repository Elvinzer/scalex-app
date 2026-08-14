"use server";

import { revalidatePath } from "next/cache";

import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { contentPostCommercialStatsSchema } from "@/lib/content-posts/schema";
import { updateContentPostCommercialStats } from "@/lib/content-posts/queries";
import { requirePermission } from "@/lib/team/context";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// externalId is the platform's own id (youtube_video_insights.videoId for
// source="youtube") — the UI never needs the content_posts row's own id,
// see lib/content-posts/queries.ts's updateContentPostCommercialStats.
export async function updatePostCommercialStats(source: string, externalId: string, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:contenu");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const parsed = contentPostCommercialStatsSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Données invalides" };

  await updateContentPostCommercialStats(access.accountId, source, externalId, parsed.data);
  revalidatePath("/acquisition/contenu");
  revalidateBusinessData(access.accountId);
  return { error: null };
}
