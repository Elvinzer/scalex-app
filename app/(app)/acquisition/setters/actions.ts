"use server";

import { revalidatePath } from "next/cache";

import { track } from "@/lib/analytics";
import { getBusinessProfile } from "@/lib/business/queries";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";
import { computeSetterCommissions, createSetter, updateSetter } from "@/lib/setters/queries";
import { setterInputSchema } from "@/lib/setters/schema";
import type { SetterCommissions } from "@/lib/setters/types";

export async function saveSetter(id: string | null, data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:setters");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const parsed = setterInputSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Données invalides" };
  }

  if (id) {
    await updateSetter(accountId, id, parsed.data);
    await track("commission_pct_changed", userId, { scope: "setter", setter_id: id });
  } else {
    const setter = await createSetter(accountId, parsed.data);
    await track("setter_added", userId, { setter_id: setter.id });
  }

  revalidatePath("/acquisition/setters");
  return { error: null };
}

export async function toggleSetterActive(id: string, active: boolean): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:setters");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await updateSetter(access.accountId, id, { active });
  revalidatePath("/acquisition/setters");
  return { error: null };
}

// Lazily fetches a setter's full sale detail for the drawer (not needed
// just to render the summary cards, which the page computes up front).
export async function getSetterCommissionsAction(setterId: string): Promise<SetterCommissions | null> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return null;
  const access = await requirePermission(userId, "acquisition:setters");
  if (!access) return null;

  const businessProfile = await getBusinessProfile(access.accountId);
  return computeSetterCommissions(access.accountId, setterId, businessProfile.sales.offers);
}
