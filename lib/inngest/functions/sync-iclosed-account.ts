import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { iclosedConnections, salesCalls } from "@/db/schema";
import { track } from "@/lib/analytics";
import { decrypt, encrypt } from "@/lib/crypto";
import { listCalls, registerWebhook } from "@/lib/iclosed/client";
import { iclosedAccountConnected, inngest } from "@/lib/inngest/client";
import { getAppUrl } from "@/lib/utils";

const BACKFILL_LIMIT = 100;

// Runs once when a user connects iClosed: registers our webhook on their
// account (so future bookings stream in live) and backfills recent + upcoming
// calls (so the /ventes/appels tab isn't empty on day one). Idempotent, per
// CLAUDE.md's Inngest rule — every step is re-run safe: webhook registration is
// guarded by an existing webhookId, and the backfill upserts with
// onConflictDoNothing so a replay never clobbers a call the closer already
// dispositioned by hand.
export const syncIclosedAccount = inngest.createFunction(
  { id: "sync-iclosed-account", triggers: [iclosedAccountConnected] },
  async ({ event, step }) => {
    const { userId } = event.data;

    const connection = await step.run("load-connection", async () => {
      const [row] = await db.select().from(iclosedConnections).where(eq(iclosedConnections.userId, userId)).limit(1);
      if (!row) throw new NonRetriableError(`No iClosed connection for user ${userId}`);
      return row;
    });

    const apiKey = decrypt(connection.apiKeyEncrypted);

    // Register the webhook only if we haven't already (re-run safe).
    if (!connection.webhookId) {
      await step.run("register-webhook", async () => {
        const deliveryUrl = `${getAppUrl()}/api/webhooks/iclosed/${connection.webhookToken}`;
        const { id, secret } = await registerWebhook(apiKey, deliveryUrl);
        await db
          .update(iclosedConnections)
          .set({
            webhookId: id,
            webhookSecretEncrypted: secret ? encrypt(secret) : null,
          })
          .where(eq(iclosedConnections.userId, userId));
      });
    }

    try {
      const inserted = await step.run("backfill-calls", async () => {
        const calls = await listCalls(apiKey, BACKFILL_LIMIT);
        if (calls.length === 0) return 0;

        const result = await db
          .insert(salesCalls)
          .values(
            calls.map((c) => ({
              userId,
              iclosedCallId: c.iclosedCallId,
              inviteeName: c.inviteeName,
              inviteeEmail: c.inviteeEmail,
              scheduledAt: c.scheduledAt,
              closer: c.closer,
              eventType: c.eventType,
            }))
          )
          // Never overwrite a call the user has already dispositioned.
          .onConflictDoNothing({ target: [salesCalls.userId, salesCalls.iclosedCallId] })
          .returning({ id: salesCalls.id });
        return result.length;
      });

      await step.run("mark-sync-completed", async () => {
        await db
          .update(iclosedConnections)
          .set({ initialSyncStatus: "completed", initialSyncCompletedAt: new Date() })
          .where(eq(iclosedConnections.userId, userId));
      });

      await track("iclosed_sync_completed", userId, { calls_backfilled: inserted });
    } catch (error) {
      await step.run("mark-sync-failed", async () => {
        await db
          .update(iclosedConnections)
          .set({ initialSyncStatus: "failed", initialSyncCompletedAt: new Date() })
          .where(eq(iclosedConnections.userId, userId));
      });
      await track("iclosed_sync_failed", userId, { step: "backfill-calls" });
      throw error;
    }
  }
);
