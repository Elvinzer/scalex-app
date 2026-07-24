"use server";

import { revalidatePath } from "next/cache";

import { adCampaignInputSchema } from "@/lib/ad-campaigns/schema";
import { createAdCampaign, deleteAdCampaign, updateAdCampaign } from "@/lib/ad-campaigns/queries";
import { track } from "@/lib/analytics";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { setLeverStatus } from "@/lib/levers/status";
import { toggleStarterStep } from "@/lib/levers/starter-plan";
import { requirePermission } from "@/lib/team/context";

const LEVER_KEY = "ads";

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

export async function toggleAdsStarterStep(stepOrder: number): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:ads");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await toggleStarterStep(access.accountId, LEVER_KEY, stepOrder);
  await track("lever_starter_step_done", userId, { lever: LEVER_KEY, stepOrder });
  revalidatePath("/acquisition/ads");
  return { error: null };
}

export async function activateAdsLever(): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:ads");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await setLeverStatus(access.accountId, LEVER_KEY, "active", {});
  await track("lever_started", userId, { lever: LEVER_KEY, source: "starter_plan" });
  revalidatePath("/acquisition/ads");
  return { error: null };
}
