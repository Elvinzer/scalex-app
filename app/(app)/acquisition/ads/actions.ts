"use server";

import { revalidatePath } from "next/cache";

import { adCampaignInputSchema } from "@/lib/ad-campaigns/schema";
import { createAdCampaign, deleteAdCampaign, updateAdCampaign } from "@/lib/ad-campaigns/queries";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";

export async function saveAdCampaign(id: string | null, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:ads");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = adCampaignInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  if (id) {
    await updateAdCampaign(accountId, id, parsed.data);
  } else {
    await createAdCampaign(accountId, parsed.data);
  }

  revalidatePath("/acquisition/ads");
  return { error: null };
}

export async function removeAdCampaign(id: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:ads");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await deleteAdCampaign(access.accountId, id);
  revalidatePath("/acquisition/ads");
  return { error: null };
}
