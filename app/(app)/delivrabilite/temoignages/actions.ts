"use server";

import { revalidatePath } from "next/cache";

import { createTestimonial, deleteTestimonial, updateTestimonial } from "@/lib/testimonials/queries";
import { testimonialInputSchema } from "@/lib/testimonials/schema";
import { createClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<string | { error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Session expirée, reconnecte-toi." };
  return data.claims.sub as string;
}

export async function saveTestimonial(id: string | null, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  const parsed = testimonialInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  if (id) {
    await updateTestimonial(userId, id, parsed.data);
  } else {
    await createTestimonial(userId, parsed.data);
  }

  revalidatePath("/delivrabilite/temoignages");
  revalidatePath("/diagnostic");
  return { error: null };
}

export async function removeTestimonial(id: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  await deleteTestimonial(userId, id);
  revalidatePath("/delivrabilite/temoignages");
  revalidatePath("/diagnostic");
  return { error: null };
}
