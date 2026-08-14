import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { diagnostics, stripeConnections, users } from "@/db/schema";
import { isAdminEmail } from "@/lib/admin";
import { track } from "@/lib/analytics";
import { decrypt } from "@/lib/crypto";
import { inngest, stripeAccountConnected, stripeSyncRequested } from "@/lib/inngest/client";
import { syncStripeSales } from "@/lib/stripe/failed-payments";
import { createReadOnlyStripeClient } from "@/lib/stripe/read-only-client";
import { syncStripeMonthlyMetrics } from "@/lib/stripe/sync-write";
import { syncStripeTransactions } from "@/lib/stripe/transaction-sync";
import { revalidateBusinessData } from "@/lib/revalidate-data";

const STRIPE_SYNC_MONTHS_BACK = 12;

export const syncStripeAccount = inngest.createFunction(
  { id: "sync-stripe-account", concurrency: { limit: 1, key: "event.data.userId" }, triggers: [stripeAccountConnected, stripeSyncRequested] },
  async ({ event, step }) => {
    const { userId } = event.data;

    // Test-mode vs livemode is checked ONCE up front, before either step —
    // never scan a test account's charges into diagnostics/monthly_metrics,
    // which would mix test and real business data. Exception: admins
    // (ADMIN_EMAILS, see lib/admin.ts) need to exercise the diagnostic
    // against a test-mode Stripe account without a live one — the bypass
    // never applies to regular users.
    const connection = await step.run("load-connection", async () => {
      const [row] = await db.select().from(stripeConnections).where(eq(stripeConnections.userId, userId)).limit(1);
      if (!row) throw new NonRetriableError(`No Stripe connection for user ${userId}`);
      return row;
    });

    const isAdminBypass = await step.run("check-admin-bypass", async () => {
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      return Boolean(user && isAdminEmail(user.email));
    });

    await step.run("mark-sync-started", async () => {
      await db
        .update(stripeConnections)
        .set({
          initialSyncStatus: "pending",
          lastSyncStartedAt: new Date(),
          lastSyncError: null,
        })
        .where(eq(stripeConnections.userId, userId));
    });

    if (!connection.livemode && !isAdminBypass) {
      await step.run("mark-sync-skipped-test-mode", async () => {
        await db
          .update(stripeConnections)
          .set({
            initialSyncStatus: "failed",
            initialSyncCompletedAt: new Date(),
            lastSyncError: "Le compte Stripe doit être en mode live pour être analysé.",
          })
          .where(eq(stripeConnections.userId, userId));
      });
      await track("stripe_sync_failed", userId, { step: "test_mode_account" });
      return;
    }

    const startedAt = Date.now();
    try {
      const failedPaymentsCents = await step.run("scan-failed-payments", async () => {
        const stripe = createReadOnlyStripeClient(decrypt(connection.accessTokenEncrypted));

        let total = 0;
        const since = Math.floor(Date.now() / 1000) - STRIPE_SYNC_MONTHS_BACK * 31 * 24 * 60 * 60;
        for await (const charge of stripe.charges.list({ created: { gte: since }, limit: 100 })) {
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

      const { monthsSynced } = await step.run("sync-monthly-metrics", async () => {
        const stripe = createReadOnlyStripeClient(decrypt(connection.accessTokenEncrypted));
        return syncStripeMonthlyMetrics(userId, stripe, STRIPE_SYNC_MONTHS_BACK);
      });

      // Reconciles succeeded/failed Connect charges and refunds into the
      // account's deal rows. Matching is scoped by account and idempotent on
      // the Stripe charge id stored in each installment.
      const reconciliation = await step.run("reconcile-sales", async () => {
        const stripe = createReadOnlyStripeClient(decrypt(connection.accessTokenEncrypted));
        return syncStripeSales(userId, stripe, STRIPE_SYNC_MONTHS_BACK);
      });

      const transactionProjection = await step.run("sync-transaction-projection", async () => {
        const stripe = createReadOnlyStripeClient(decrypt(connection.accessTokenEncrypted));
        return syncStripeTransactions(userId, connection.stripeAccountId, stripe, STRIPE_SYNC_MONTHS_BACK);
      });

      await step.run("mark-sync-completed", async () => {
        await db
          .update(stripeConnections)
          .set({
            initialSyncStatus: "completed",
            initialSyncCompletedAt: new Date(),
            lastSyncCompletedAt: new Date(),
            lastSyncError: null,
          })
          .where(eq(stripeConnections.userId, userId));
      });

      await track("stripe_sync_completed", userId, {
        months: monthsSynced,
        duration_ms: Date.now() - startedAt,
        matched: reconciliation.matched,
        created: reconciliation.created,
        orphaned: reconciliation.orphaned,
        refunded: reconciliation.refunded,
        skipped: reconciliation.skipped,
        ambiguous: reconciliation.ambiguous,
        transaction_rows: transactionProjection.transactionsUpserted,
        refund_rows: transactionProjection.refundsUpserted,
        invalid_transaction_rows: transactionProjection.invalidCharges,
        invalid_refund_rows: transactionProjection.invalidRefunds,
      });
      revalidateBusinessData(userId);
    } catch (error) {
      await step.run("mark-sync-failed", async () => {
        await db
          .update(stripeConnections)
          .set({
            initialSyncStatus: "failed",
            initialSyncCompletedAt: new Date(),
            lastSyncError: "Stripe n'a pas pu actualiser les données. Réessaie plus tard.",
          })
          .where(eq(stripeConnections.userId, userId));
      });
      await track("stripe_sync_failed", userId, { step: "stripe_sync" });
      throw error;
    }
  }
);
