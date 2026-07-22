import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { diagnostics, stripeConnections } from "@/db/schema";
import { track } from "@/lib/analytics";
import { decrypt } from "@/lib/crypto";
import { inngest, stripeAccountConnected } from "@/lib/inngest/client";
import { createReadOnlyStripeClient } from "@/lib/stripe/read-only-client";
import { syncStripeMonthlyMetrics } from "@/lib/stripe/sync-write";

const STRIPE_SYNC_MONTHS_BACK = 12;

export const syncStripeAccount = inngest.createFunction(
  { id: "sync-stripe-account", triggers: [stripeAccountConnected] },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Test-mode vs livemode is checked ONCE up front, before either step —
    // never scan a test account's charges into diagnostics/monthly_metrics,
    // which would mix test and real business data.
    const connection = await step.run("load-connection", async () => {
      const [row] = await db.select().from(stripeConnections).where(eq(stripeConnections.userId, userId)).limit(1);
      if (!row) throw new NonRetriableError(`No Stripe connection for user ${userId}`);
      return row;
    });

    if (!connection.livemode) {
      await step.run("mark-sync-skipped-test-mode", async () => {
        await db
          .update(stripeConnections)
          .set({ initialSyncStatus: "failed", initialSyncCompletedAt: new Date() })
          .where(eq(stripeConnections.userId, userId));
      });
      await track("stripe_sync_failed", userId, { step: "test_mode_account" });
      return;
    }

    const failedPaymentsCents = await step.run("scan-failed-payments", async () => {
      const stripe = createReadOnlyStripeClient(decrypt(connection.accessTokenEncrypted));

      let total = 0;
      for await (const charge of stripe.charges.list({ limit: 100 })) {
        if (charge.status === "failed") {
          total += charge.amount;
        }
      }
      return total;
    });

    await step.run("write-diagnostic", async () => {
      await db
        .insert(diagnostics)
        .values({
          userId,
          category: "failed_payments",
          score: 0,
          dollarsLost: failedPaymentsCents,
        })
        .onConflictDoUpdate({
          target: [diagnostics.userId, diagnostics.category],
          set: {
            dollarsLost: failedPaymentsCents,
            computedAt: new Date(),
          },
        });
    });

    const startedAt = Date.now();
    try {
      const { monthsSynced } = await step.run("sync-monthly-metrics", async () => {
        const stripe = createReadOnlyStripeClient(decrypt(connection.accessTokenEncrypted));
        return syncStripeMonthlyMetrics(userId, stripe, STRIPE_SYNC_MONTHS_BACK);
      });

      await step.run("mark-sync-completed", async () => {
        await db
          .update(stripeConnections)
          .set({ initialSyncStatus: "completed", initialSyncCompletedAt: new Date() })
          .where(eq(stripeConnections.userId, userId));
      });

      await track("stripe_sync_completed", userId, { months: monthsSynced, duration_ms: Date.now() - startedAt });
    } catch (error) {
      await step.run("mark-sync-failed", async () => {
        await db
          .update(stripeConnections)
          .set({ initialSyncStatus: "failed", initialSyncCompletedAt: new Date() })
          .where(eq(stripeConnections.userId, userId));
      });
      await track("stripe_sync_failed", userId, { step: "sync-monthly-metrics" });
      throw error;
    }
  }
);
