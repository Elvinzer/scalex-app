"use server";

import { revalidatePath } from "next/cache";

import { closingVideoInputSchema } from "@/lib/closing-videos/schema";
import { createClosingVideo, deleteClosingVideo, updateClosingVideo } from "@/lib/closing-videos/queries";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";

export async function saveClosingVideo(id: string | null, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  const parsed = closingVideoInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  if (id) {
    await updateClosingVideo(userId, id, parsed.data);
  } else {
    await createClosingVideo(userId, parsed.data);
  }

  revalidatePath("/ventes/videos");
  return { error: null };
}

export async function removeClosingVideo(id: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  await deleteClosingVideo(userId, id);
  revalidatePath("/ventes/videos");
  return { error: null };
}
