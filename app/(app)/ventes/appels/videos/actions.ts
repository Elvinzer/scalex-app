"use server";

import { revalidatePath } from "next/cache";

import { closingVideoInputSchema } from "@/lib/closing-videos/schema";
import { createClosingVideo, deleteClosingVideo, salesCallBelongsToUser, updateClosingVideo } from "@/lib/closing-videos/queries";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";
import { revalidateBusinessData } from "@/lib/revalidate-data";

export async function saveClosingVideo(id: string | null, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:videos");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = closingVideoInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }
  if (parsed.data.salesCallId && !(await salesCallBelongsToUser(accountId, parsed.data.salesCallId))) {
    return { error: "L’appel sélectionné n’appartient pas à ce compte." };
  }

  if (id) {
    await updateClosingVideo(accountId, id, parsed.data);
  } else {
    await createClosingVideo(accountId, parsed.data);
  }

  revalidatePath("/ventes/appels/videos");
  revalidateBusinessData();
  return { error: null };
}

export async function removeClosingVideo(id: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:videos");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await deleteClosingVideo(access.accountId, id);
  revalidatePath("/ventes/appels/videos");
  revalidateBusinessData();
  return { error: null };
}
