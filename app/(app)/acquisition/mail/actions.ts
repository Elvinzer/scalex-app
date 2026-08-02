"use server";

import { revalidatePath } from "next/cache";

import { track } from "@/lib/analytics";
import { createEmailCampaign, deleteEmailCampaign, updateEmailCampaign } from "@/lib/email-campaigns/queries";
import { emailCampaignInputSchema } from "@/lib/email-campaigns/schema";
import { setLeverStatus } from "@/lib/levers/status";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";

const LEVER_KEY = "email_marketing";

export async function saveEmailCampaign(id: string | null, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:mail");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = emailCampaignInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  if (id) {
    await updateEmailCampaign(accountId, id, parsed.data);
  } else {
    await createEmailCampaign(accountId, parsed.data);
  }

  revalidatePath("/acquisition/mail");
  return { error: null };
}

export async function removeEmailCampaign(id: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:mail");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await deleteEmailCampaign(access.accountId, id);
  revalidatePath("/acquisition/mail");
  return { error: null };
}

// Découverte's single yes/no (+ listSize) question for this one lever —
// reuses the same setLeverStatus core as saveLeverAnswer (diagnostic) but
// without any of its Découverte-parcours bookkeeping.
export async function saveMailDiscoveryAnswer(
  status: "active" | "absent",
  stats: Record<string, number | string>
): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:mail");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const { justActivated } = await setLeverStatus(access.accountId, LEVER_KEY, status, stats);
  if (justActivated) await track("lever_started", userId, { lever: LEVER_KEY, source: "discovery" });

  revalidatePath("/acquisition/mail");
  return { error: null };
}
