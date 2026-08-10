"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { getAccountContext } from "@/lib/team/context";

import { MAX_WEEKLY_GOAL, MIN_WEEKLY_GOAL } from "./rules";
import { setReminderOptIn, setWeeklyGoal } from "./service";

// Scoped to the account owner's id, like every other user-scoped write here:
// the streak belongs to the business, not to whichever team member is logged
// in, so two members never see two different flames.
async function requireAccountId(): Promise<string | { error: string }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) return { error: "Session expirée." };

  const context = await getAccountContext(userId);
  if (!context) return { error: "Compte introuvable." };
  return context.accountId;
}

const goalSchema = z.number().int().min(MIN_WEEKLY_GOAL).max(MAX_WEEKLY_GOAL);

export async function adjustWeeklyGoalAction(goal: number): Promise<{ error: string | null; goal?: number }> {
  const accountId = await requireAccountId();
  if (typeof accountId !== "string") return accountId;

  const parsed = goalSchema.safeParse(goal);
  if (!parsed.success) return { error: `L'objectif doit être entre ${MIN_WEEKLY_GOAL} et ${MAX_WEEKLY_GOAL}.` };

  const next = await setWeeklyGoal(accountId, parsed.data);
  revalidatePath("/roadmap");
  return { error: null, goal: next };
}

export async function toggleStreakReminderAction(optIn: boolean): Promise<{ error: string | null }> {
  const accountId = await requireAccountId();
  if (typeof accountId !== "string") return accountId;

  await setReminderOptIn(accountId, z.boolean().parse(optIn));
  revalidatePath("/roadmap");
  return { error: null };
}
