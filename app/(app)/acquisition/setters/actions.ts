"use server";

import { track } from "@/lib/analytics";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { requirePermission } from "@/lib/team/context";
import { createSetter, updateSetter } from "@/lib/setters/queries";
import { setterInputSchema } from "@/lib/setters/schema";
import { revalidateBusinessData } from "@/lib/revalidate-data";

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

  revalidateBusinessData();
  return { error: null };
}

export async function toggleSetterActive(id: string, active: boolean): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "acquisition:setters");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await updateSetter(access.accountId, id, { active });
  revalidateBusinessData();
  return { error: null };
}
