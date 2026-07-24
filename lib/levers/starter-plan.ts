import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { leverStarterPlans, leverStarterProgress } from "@/db/schema";

export type StarterPlanStep = { order: number; title: string };

export async function getStarterPlan(leverKey: string): Promise<StarterPlanStep[] | null> {
  const [row] = await db.select().from(leverStarterPlans).where(eq(leverStarterPlans.leverKey, leverKey)).limit(1);
  return row ? row.steps : null;
}

export async function getStarterProgress(accountId: string, leverKey: string): Promise<number[]> {
  const [row] = await db
    .select()
    .from(leverStarterProgress)
    .where(and(eq(leverStarterProgress.userId, accountId), eq(leverStarterProgress.leverKey, leverKey)))
    .limit(1);
  return row?.completedSteps ?? [];
}

// Toggles one step on/off — no permission check here (same convention as
// lib/levers/status.ts), callers (the "use server" actions) check their own
// relevant permission first.
export async function toggleStarterStep(accountId: string, leverKey: string, stepOrder: number): Promise<number[]> {
  const current = await getStarterProgress(accountId, leverKey);
  const next = current.includes(stepOrder) ? current.filter((step) => step !== stepOrder) : [...current, stepOrder];

  await db
    .insert(leverStarterProgress)
    .values({ userId: accountId, leverKey, completedSteps: next })
    .onConflictDoUpdate({
      target: [leverStarterProgress.userId, leverStarterProgress.leverKey],
      set: { completedSteps: next, updatedAt: new Date() },
    });

  return next;
}
