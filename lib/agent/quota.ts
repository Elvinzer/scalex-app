import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { sharedAgentUsage } from "@/db/schema";

// Optional per-business cap, separate from the platform exposure ceiling.
export const SHARED_KEY_MONTHLY_QUOTA: number | null = null;
export const DEFAULT_PLATFORM_SHARED_MONTHLY_LIMIT = 10_000;

export function getPlatformSharedMonthlyLimit(value = process.env.ANTHROPIC_SHARED_MONTHLY_REQUEST_LIMIT): number {
  if (!value || !/^\d+$/.test(value.trim())) return DEFAULT_PLATFORM_SHARED_MONTHLY_LIMIT;
  const limit = Number(value);
  return Number.isSafeInteger(limit) && limit > 0 ? limit : DEFAULT_PLATFORM_SHARED_MONTHLY_LIMIT;
}

export class SharedKeyQuotaExceededError extends Error {
  constructor() {
    super("Quota mensuel de la clé partagée atteint. Ajoute ta propre clé Anthropic dans Réglages.");
    this.name = "SharedKeyQuotaExceededError";
  }
}

function currentPeriodMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Reserve a shared request atomically across every business and worker.
// BYOK consumption is recorded separately in agentTokenUsage.
export async function checkAndIncrementSharedUsage(userId: string): Promise<void> {
  if (process.env.ANTHROPIC_SHARED_DISABLED?.trim().toLowerCase() === "true") throw new SharedKeyQuotaExceededError();
  const periodMonth = currentPeriodMonth();
  await db.transaction(async (tx) => {
    // Serialize reservations across workers, not just within one Node process.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`minaly-shared-agent:${periodMonth}`}, 0))`);
    const [total] = await tx.select({ count: sql<number>`coalesce(sum(${sharedAgentUsage.requestCount}), 0)::integer` })
      .from(sharedAgentUsage).where(eq(sharedAgentUsage.periodMonth, periodMonth));
    if ((total?.count ?? 0) >= getPlatformSharedMonthlyLimit()) throw new SharedKeyQuotaExceededError();
    if (SHARED_KEY_MONTHLY_QUOTA !== null) {
      const [usage] = await tx.select({ count: sharedAgentUsage.requestCount }).from(sharedAgentUsage)
        .where(and(eq(sharedAgentUsage.userId, userId), eq(sharedAgentUsage.periodMonth, periodMonth))).limit(1);
      if ((usage?.count ?? 0) >= SHARED_KEY_MONTHLY_QUOTA) throw new SharedKeyQuotaExceededError();
    }
    await tx.insert(sharedAgentUsage).values({ userId, periodMonth, requestCount: 1 })
      .onConflictDoUpdate({ target: [sharedAgentUsage.userId, sharedAgentUsage.periodMonth], set: { requestCount: sql`${sharedAgentUsage.requestCount} + 1` } });
  });
}
