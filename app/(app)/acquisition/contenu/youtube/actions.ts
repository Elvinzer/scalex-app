"use server";

import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { contentRecommendations, improvementEvents, todos, youtubeVideoInsights } from "@/db/schema";
import { track } from "@/lib/analytics";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { isPublicVideo } from "@/lib/youtube/format";
import { rebuildYoutubeContentRecommendations } from "@/lib/youtube/recommendations";

const recommendationIdSchema = z.string().uuid();
const videoIdSchema = z.string().trim().min(1).max(120);

async function requireYoutubeContentAccess(): Promise<{ userId: string; accountId: string } | { error: string }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:contenu");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  return { userId, accountId: access.accountId };
}

export type RecommendationActionResult = {
  error: string | null;
  state?: "generated" | "insufficient_data" | "generation_failed";
  count?: number;
};

export async function regenerateYoutubeRecommendations(): Promise<RecommendationActionResult> {
  const access = await requireYoutubeContentAccess();
  if ("error" in access) return access;

  const result = await rebuildYoutubeContentRecommendations(access.accountId, access.userId);
  if (result.state === "generated") {
    await track("content_reco_generated", access.userId, { count: result.count });
  }

  revalidatePath("/acquisition/contenu");
  revalidatePath("/acquisition/contenu/youtube");
  revalidateBusinessData();
  return {
    error: result.state === "generation_failed" ? "Falco n'a pas pu régénérer les idées. Réessaie dans un instant." : null,
    state: result.state,
    count: result.count,
  };
}

export async function acceptYoutubeRecommendation(recommendationId: string): Promise<{ error: string | null }> {
  const access = await requireYoutubeContentAccess();
  if ("error" in access) return access;
  const parsed = recommendationIdSchema.safeParse(recommendationId);
  if (!parsed.success) return { error: "Recommandation invalide." };

  const result = await db.transaction(async (tx) => {
    const [updated] = await tx
      .update(contentRecommendations)
      .set({ status: "filming", updatedAt: new Date() })
      .where(
        and(
          eq(contentRecommendations.id, parsed.data),
          eq(contentRecommendations.userId, access.accountId),
          or(eq(contentRecommendations.status, "new"), eq(contentRecommendations.status, "building"))
        )
      )
      .returning({ id: contentRecommendations.id, title: contentRecommendations.title });

    if (!updated) return false;

    await tx.insert(todos).values({
      userId: access.accountId,
      label: `À tourner : ${updated.title}`,
      isBusinessImprovement: true,
    });
    await tx.insert(improvementEvents).values({
      userId: access.accountId,
      date: new Date().toISOString().slice(0, 10),
      type: "content_recommendation_accepted",
      label: `Vidéo à tourner : ${updated.title}`,
      sourceId: updated.id,
    });
    return true;
  });

  if (result) {
    await track("content_reco_accepted", access.userId, { reco_id: parsed.data });
  }
  revalidatePath("/acquisition/contenu");
  revalidatePath("/acquisition/contenu/youtube");
  revalidatePath("/roadmap");
  revalidateBusinessData();
  return { error: null };
}

export async function linkYoutubeRecommendationToVideo(
  recommendationId: string,
  videoId: string
): Promise<{ error: string | null }> {
  const access = await requireYoutubeContentAccess();
  if ("error" in access) return access;
  const parsedRecommendationId = recommendationIdSchema.safeParse(recommendationId);
  const parsedVideoId = videoIdSchema.safeParse(videoId);
  if (!parsedRecommendationId.success || !parsedVideoId.success) return { error: "Vidéo ou recommandation invalide." };

  const [video] = await db
    .select()
    .from(youtubeVideoInsights)
    .where(and(eq(youtubeVideoInsights.userId, access.accountId), eq(youtubeVideoInsights.videoId, parsedVideoId.data)))
    .limit(1);
  if (!video || !isPublicVideo(video)) return { error: "Cette vidéo YouTube publique est introuvable." };

  const [updated] = await db
    .update(contentRecommendations)
    .set({ linkedVideoId: video.videoId, status: "published", updatedAt: new Date() })
    .where(and(eq(contentRecommendations.id, parsedRecommendationId.data), eq(contentRecommendations.userId, access.accountId)))
    .returning({ id: contentRecommendations.id });
  if (!updated) return { error: "Recommandation introuvable." };

  await track("content_reco_published", access.userId, { reco_id: parsedRecommendationId.data });
  revalidatePath("/acquisition/contenu");
  revalidatePath("/acquisition/contenu/youtube");
  revalidateBusinessData();
  return { error: null };
}
