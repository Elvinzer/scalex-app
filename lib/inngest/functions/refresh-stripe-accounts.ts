import { cron } from "inngest";

import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { inngest, stripeSyncRequested } from "@/lib/inngest/client";

// Daily rebuild of the recent Stripe projection. The event is sent once per
// account at the top level so each account gets the same retry/idempotency
// behavior as a manually requested refresh.
export const refreshStripeAccounts = inngest.createFunction(
  { id: "refresh-stripe-accounts", triggers: [cron("0 4 * * *")] },
  async ({ step }) => {
    const connections = await step.run("load-stripe-connections", async () =>
      db.select({ userId: stripeConnections.userId }).from(stripeConnections),
    );

    for (const connection of connections) {
      await step.sendEvent(
        `request-stripe-sync-${connection.userId}`,
        stripeSyncRequested.create({ userId: connection.userId }),
      );
    }

    return { requested: connections.length };
  },
);

