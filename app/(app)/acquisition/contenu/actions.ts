"use server";

import { revalidatePath } from "next/cache";

import { contentPostInputSchema } from "@/lib/content-posts/schema";
import { createContentPost, deleteContentPost, updateContentPost } from "@/lib/content-posts/queries";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";

export async function saveContentPost(id: string | null, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:contenu");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = contentPostInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  if (id) {
    await updateContentPost(accountId, id, parsed.data);
  } else {
    await createContentPost(accountId, parsed.data);
  }

  revalidatePath("/acquisition/contenu");
  revalidatePath("/diagnostic");
  return { error: null };
}

export async function removeContentPost(id: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:contenu");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await deleteContentPost(access.accountId, id);
  revalidatePath("/acquisition/contenu");
  revalidatePath("/diagnostic");
  return { error: null };
}
