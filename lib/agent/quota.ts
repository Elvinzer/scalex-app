import { sql } from "drizzle-orm";

import { db } from "@/db";
import { sharedAgentUsage } from "@/db/schema";

// Single point to change when a monthly cap on the shared fallback key is
// needed (e.g. tied to subscription tiers) — null means unlimited, no
// request is ever blocked. See CLAUDE.md's BYOK rule.
export const SHARED_KEY_MONTHLY_QUOTA: number | null = null;

export class SharedKeyQuotaExceededError extends Error {
  constructor() {
    super("Quota mensuel de la clé partagée atteint — ajoute ta propre clé Anthropic dans Réglages.");
    this.name = "SharedKeyQuotaExceededError";
  }
}

function currentPeriodMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Increments the user's shared-key usage counter for the current month and
// throws once SHARED_KEY_MONTHLY_QUOTA is exceeded. Never called for BYOK
// requests — those cost Scale X nothing, so they aren't tracked here.
export async function checkAndIncrementSharedUsage(userId: string): Promise<void> {
  const periodMonth = currentPeriodMonth();

  const [row] = await db
    .insert(sharedAgentUsage)
    .values({ userId, periodMonth, requestCount: 1 })
    .onConflictDoUpdate({
      target: [sharedAgentUsage.userId, sharedAgentUsage.periodMonth],
      set: { requestCount: sql`${sharedAgentUsage.requestCount} + 1` },
    })
    .returning({ requestCount: sharedAgentUsage.requestCount });

  if (SHARED_KEY_MONTHLY_QUOTA !== null && row.requestCount > SHARED_KEY_MONTHLY_QUOTA) {
    throw new SharedKeyQuotaExceededError();
  }
}
