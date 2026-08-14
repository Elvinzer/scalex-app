import { randomBytes } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { calendlyConnections } from "@/db/schema";
import { track } from "@/lib/analytics";
import { backfillCalendlyCalls } from "@/lib/calendly/backfill";
import { CalendlyNoAccessError, registerWebhook } from "@/lib/calendly/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { calendlyAccountConnected, inngest } from "@/lib/inngest/client";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { getAppUrl } from "@/lib/utils";

// Runs once when a user connects Calendly: registers a real-time webhook
// subscription (invitee.created/canceled) and backfills recent scheduled events.
// Idempotent: webhook registration is guarded by an existing webhookId, and the
// backfill upserts with onConflictDoNothing. The sync is marked failed when the
// webhook cannot be registered, because live delivery is the source of truth
// after the initial backfill.
export const syncCalendlyAccount = inngest.createFunction(
  { id: "sync-calendly-account", concurrency: { limit: 1, key: "event.data.userId" }, triggers: [calendlyAccountConnected] },
  async ({ event, step }) => {
    const { userId, connectionId } = event.data;

    const connection = await step.run("load-connection", async () => {
      const [row] = await db
        .select()
        .from(calendlyConnections)
        .where(and(eq(calendlyConnections.id, connectionId), eq(calendlyConnections.userId, userId)))
        .limit(1);
      if (!row) throw new NonRetriableError(`No Calendly connection for event ${connectionId}`);
      return row;
    });

    const { organizationUri, userUri, webhookToken } = connection;

    try {
      const token = decrypt(connection.accessTokenEncrypted);
      if (!connection.webhookId && organizationUri && userUri) {
        await step.run("register-webhook", async () => {
          const signingKey = randomBytes(32).toString("hex");
          const deliveryUrl = `${getAppUrl()}/api/webhooks/calendly/${webhookToken}`;
          const { id, signingKey: key } = await registerWebhook(token, {
            url: deliveryUrl,
            orgUri: organizationUri,
            userUri,
            signingKey,
          });
          if (!id) throw new Error("Calendly webhook registration returned no subscription id");
          await db
            .update(calendlyConnections)
            .set({ webhookId: id, webhookSigningKeyEncrypted: key ? encrypt(key) : null })
            .where(eq(calendlyConnections.id, connectionId));
        });
      }

      const inserted = await step.run("backfill-calls", () => backfillCalendlyCalls(userId, token, userUri ?? ""));

      await step.run("mark-sync-completed", async () => {
        await db
          .update(calendlyConnections)
          .set({ initialSyncStatus: "completed", initialSyncCompletedAt: new Date() })
          .where(eq(calendlyConnections.id, connectionId));
      });

      revalidateBusinessData(userId);
      await track("calendly_sync_completed", userId, { calls_backfilled: inserted });
    } catch (error) {
      const noAccess = error instanceof CalendlyNoAccessError;
      await step.run("mark-sync-failed", async () => {
        await db
          .update(calendlyConnections)
          .set({ initialSyncStatus: noAccess ? "no_api_access" : "failed", initialSyncCompletedAt: new Date() })
          .where(eq(calendlyConnections.id, connectionId));
      });
      await track("calendly_sync_failed", userId, { step: "backfill-calls", reason: noAccess ? "no_api_access" : "error" });
      if (noAccess) return;
      throw error;
    }
  }
);
