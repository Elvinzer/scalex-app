import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { monthlyMetrics } from "@/db/schema";

import type { ReadOnlyStripeClient } from "./read-only-client";
import { aggregateStripeMonths, fetchStripeHistory } from "./sync";
import { DEFAULT_STRIPE_TIMEZONE } from "./timezone";

// Split from sync.ts (which stays pure/DB-free and unit-testable without a
// live database) — this file is the thin DB-writing layer.

// Writes one month's synced values. cashCollected preserves a pre-existing
// MANUAL value into cashCollectedManualBackup exactly once (only when the
// field has never been Stripe-sourced before: source === null), never
// destroyed, never re-captured on a later re-sync (which would overwrite the
// real backup with a frozen Stripe figure instead). newCustomers has no
// manual equivalent to ever preserve — see db/schema.ts's comment.
export async function upsertStripeMonthlyMetrics(
  accountId: string,
  year: number,
  month: number,
  values: { cashCollectedEur: number; newCustomers: number }
): Promise<void> {
  const [existing] = await db
    .select()
    .from(monthlyMetrics)
    .where(and(eq(monthlyMetrics.userId, accountId), eq(monthlyMetrics.year, year), eq(monthlyMetrics.month, month)))
    .limit(1);

  const now = new Date();
  const patch: Partial<typeof monthlyMetrics.$inferInsert> = {
    cashCollected: values.cashCollectedEur,
    cashCollectedSource: "stripe",
    cashCollectedSyncedAt: now,
    newCustomers: values.newCustomers,
    newCustomersSource: "stripe",
    newCustomersSyncedAt: now,
    updatedAt: now,
  };

  if (existing) {
    if (existing.cashCollectedSource === null && existing.cashCollected !== null) {
      patch.cashCollectedManualBackup = existing.cashCollected;
    }
    await db.update(monthlyMetrics).set(patch).where(eq(monthlyMetrics.id, existing.id));
  } else {
    await db.insert(monthlyMetrics).values({ userId: accountId, year, month, ...patch });
  }
}

// Top-level orchestrator called by lib/inngest/functions/sync-stripe-account.ts.
export async function syncStripeMonthlyMetrics(
  accountId: string,
  stripe: ReadOnlyStripeClient,
  monthsBack = 12,
  timeZone: string = DEFAULT_STRIPE_TIMEZONE
): Promise<{ monthsSynced: number }> {
  const { charges, refunds, customers } = await fetchStripeHistory(stripe, monthsBack);
  const months = aggregateStripeMonths(charges, refunds, customers, timeZone);

  for (const month of months) {
    await upsertStripeMonthlyMetrics(accountId, month.year, month.month, {
      cashCollectedEur: Math.round(month.cashCollectedCents / 100),
      newCustomers: month.newCustomers,
    });
  }

  return { monthsSynced: months.length };
}
