import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";
import Stripe from "stripe";

import { db } from "@/db";
import { diagnostics, stripeConnections } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { inngest, stripeAccountConnected } from "@/lib/inngest/client";

export const syncStripeAccount = inngest.createFunction(
  { id: "sync-stripe-account", triggers: [stripeAccountConnected] },
  async ({ event, step }) => {
    const { userId } = event.data;

    const failedPaymentsCents = await step.run("scan-failed-payments", async () => {
      const [connection] = await db
        .select()
        .from(stripeConnections)
        .where(eq(stripeConnections.userId, userId))
        .limit(1);

      if (!connection) {
        throw new NonRetriableError(`No Stripe connection for user ${userId}`);
      }

      const stripe = new Stripe(decrypt(connection.accessTokenEncrypted));

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
          dollarsLost: Math.round(failedPaymentsCents / 100),
        })
        .onConflictDoUpdate({
          target: [diagnostics.userId, diagnostics.category],
          set: {
            dollarsLost: Math.round(failedPaymentsCents / 100),
            computedAt: new Date(),
          },
        });
    });
  }
);
