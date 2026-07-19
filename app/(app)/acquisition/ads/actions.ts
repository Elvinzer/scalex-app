"use server";

import { revalidatePath } from "next/cache";

import { adCampaignInputSchema } from "@/lib/ad-campaigns/schema";
import { createAdCampaign, deleteAdCampaign, updateAdCampaign } from "@/lib/ad-campaigns/queries";
import { createClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<string | { error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return { error: "Session expirée, reconnecte-toi." };
  return data.claims.sub as string;
}

export async function saveAdCampaign(id: string | null, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  const parsed = adCampaignInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  if (id) {
    await updateAdCampaign(userId, id, parsed.data);
  } else {
    await createAdCampaign(userId, parsed.data);
  }

  revalidatePath("/acquisition/ads");
  return { error: null };
}

export async function removeAdCampaign(id: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;

  await deleteAdCampaign(userId, id);
  revalidatePath("/acquisition/ads");
  return { error: null };
}
