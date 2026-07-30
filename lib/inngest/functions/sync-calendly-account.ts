import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { calendlyConnections } from "@/db/schema";
import { track } from "@/lib/analytics";
import { backfillCalendlyCalls } from "@/lib/calendly/backfill";
import { CalendlyNoAccessError, registerWebhook } from "@/lib/calendly/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { calendlyAccountConnected, inngest } from "@/lib/inngest/client";
import { getAppUrl } from "@/lib/utils";

// Runs once when a user connects Calendly: registers a real-time webhook
// subscription (invitee.created/canceled) and backfills recent scheduled events.
// Idempotent: webhook registration is guarded by an existing webhookId, backfill
// upserts with onConflictDoNothing. A missing paid-plan / API access surfaces as
// "no_api_access" (permanent, not retried); other failures mark "failed" so the
// UI never hangs on "pending". A non-access webhook error doesn't block the
// backfill (real-time is a bonus; the pull is the data).
export const syncCalendlyAccount = inngest.createFunction(
  { id: "sync-calendly-account", triggers: [calendlyAccountConnected] },
  async ({ event, step }) => {
    const { userId } = event.data;

    const connection = await step.run("load-connection", async () => {
      const [row] = await db.select().from(calendlyConnections).where(eq(calendlyConnections.userId, userId)).limit(1);
      if (!row) throw new NonRetriableError(`No Calendly connection for user ${userId}`);
      return row;
    });

    const token = decrypt(connection.accessTokenEncrypted);
    const { organizationUri, userUri, webhookToken } = connection;

    try {
      if (!connection.webhookId && organizationUri && userUri) {
        await step.run("register-webhook", async () => {
          const signingKey = randomBytes(32).toString("hex");
          const deliveryUrl = `${getAppUrl()}/api/webhooks/calendly/${webhookToken}`;
          try {
            const { id, signingKey: key } = await registerWebhook(token, {
              url: deliveryUrl,
              orgUri: organizationUri,
              userUri,
              signingKey,
            });
            await db
              .update(calendlyConnections)
              .set({ webhookId: id, webhookSigningKeyEncrypted: key ? encrypt(key) : null })
              .where(eq(calendlyConnections.userId, userId));
          } catch (error) {
            // A plan/access rejection is real and worth surfacing — let it fail
            // the sync. Any other webhook hiccup must not block the backfill.
            if (error instanceof CalendlyNoAccessError) throw error;
            console.error("Calendly webhook registration failed (continuing without real-time)", error);
          }
        });
      }

      const inserted = await step.run("backfill-calls", () => backfillCalendlyCalls(userId, token, userUri ?? ""));

      await step.run("mark-sync-completed", async () => {
        await db
          .update(calendlyConnections)
          .set({ initialSyncStatus: "completed", initialSyncCompletedAt: new Date() })
          .where(eq(calendlyConnections.userId, userId));
      });

      await track("calendly_sync_completed", userId, { calls_backfilled: inserted });
    } catch (error) {
      const noAccess = error instanceof CalendlyNoAccessError;
      await step.run("mark-sync-failed", async () => {
        await db
          .update(calendlyConnections)
          .set({ initialSyncStatus: noAccess ? "no_api_access" : "failed", initialSyncCompletedAt: new Date() })
          .where(eq(calendlyConnections.userId, userId));
      });
      await track("calendly_sync_failed", userId, { step: "backfill-calls", reason: noAccess ? "no_api_access" : "error" });
      if (noAccess) return;
      throw error;
    }
  }
);
