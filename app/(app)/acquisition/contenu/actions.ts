"use server";

import { revalidatePath } from "next/cache";

import { contentPostInputSchema } from "@/lib/content-posts/schema";
import { createContentPost, deleteContentPost, updateContentPost } from "@/lib/content-posts/queries";
import { createClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<string | { error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Session expirée, reconnecte-toi." };
  return data.claims.sub as string;
}

export async function saveContentPost(id: string | null, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  const parsed = contentPostInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  if (id) {
    await updateContentPost(userId, id, parsed.data);
  } else {
    await createContentPost(userId, parsed.data);
  }

  revalidatePath("/acquisition/contenu");
  revalidatePath("/diagnostic");
  return { error: null };
}

export async function removeContentPost(id: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  await deleteContentPost(userId, id);
  revalidatePath("/acquisition/contenu");
  revalidatePath("/diagnostic");
  return { error: null };
}
