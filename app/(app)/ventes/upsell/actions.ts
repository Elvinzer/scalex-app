"use server";

import { revalidatePath } from "next/cache";

import { track } from "@/lib/analytics";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { setLeverStatus } from "@/lib/levers/status";
import { toggleStarterStep } from "@/lib/levers/starter-plan";
import { requirePermission } from "@/lib/team/context";

const LEVER_KEY = "upsell_ascension";

export async function toggleUpsellStarterStep(stepOrder: number): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:upsell");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await toggleStarterStep(access.accountId, LEVER_KEY, stepOrder);
  await track("lever_starter_step_done", userId, { lever: LEVER_KEY, stepOrder });
  revalidatePath("/ventes/upsell");
  return { error: null };
}

// upsell_ascension normally resolves from business_profile.delivery.upsellOfferId
// (readsFromProfile) — this only writes a fallback businessLevers row so a
// user who's done the manual work (proposé, première vente) but hasn't
// formalized the offer in Produits yet can still flip this page's own mode
// check. The page's mode logic ORs this with the profile signal; the shared
// catalog/Découverte resolution elsewhere stays profile-only, unaffected.
export async function activateUpsellLever(): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "ventes:upsell");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await setLeverStatus(access.accountId, LEVER_KEY, "active", {});
  await track("lever_started", userId, { lever: LEVER_KEY, source: "starter_plan" });
  revalidatePath("/ventes/upsell");
  return { error: null };
}
