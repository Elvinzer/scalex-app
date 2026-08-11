"use server";

import { revalidatePath } from "next/cache";

import { track } from "@/lib/analytics";
import { requireUserIdOrError as requireUserId } from "@/lib/current-user";
import { setLeverStatus } from "@/lib/levers/status";
import { toggleStarterStep } from "@/lib/levers/starter-plan";
import { requirePermission } from "@/lib/team/context";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// Generic replacements for the 3 near-identical per-lever
// toggle*StarterStep/activate*Lever actions (ads/mail/upsell) — this route
// serves every catalog lever via the dynamic [leverKey] segment, so there's
// no single hardcoded LEVER_KEY/permission/revalidate path to copy-paste per
// lever. Gated on "diagnostic" (same as the page itself): this route has no
// per-lever dedicated permission, it's reached from the Diagnostic hub.
export async function toggleLeverStep(leverKey: string, stepOrder: number): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "diagnostic");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  await toggleStarterStep(access.accountId, leverKey, stepOrder);
  await track("lever_starter_step_done", userId, { lever: leverKey, stepOrder });
  revalidatePath(`/demarrer/${leverKey}`);
  revalidateBusinessData();
  return { error: null };
}

export async function activateLever(leverKey: string): Promise<{ error: string | null }> {
  const userId = await requireUserId();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "diagnostic");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const { justActivated } = await setLeverStatus(access.accountId, leverKey, "active", {});
  // Only on a genuine transition — fixes the 3 old per-lever actions'
  // unconditional track() call (they fired even when re-clicking an
  // already-active lever).
  if (justActivated) {
    await track("lever_started", userId, { lever: leverKey, source: "demarrer_page" });
  }
  revalidatePath(`/demarrer/${leverKey}`);
  revalidateBusinessData();
  return { error: null };
}
