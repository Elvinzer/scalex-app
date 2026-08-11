import { and, eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { iclosedConnections } from "@/db/schema";
import { track } from "@/lib/analytics";
import { decrypt } from "@/lib/crypto";
import { backfillIclosedCalls } from "@/lib/iclosed/backfill";
import { IclosedNoApiAccessError } from "@/lib/iclosed/client";
import { iclosedAccountConnected, inngest } from "@/lib/inngest/client";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// Runs once when a user connects iClosed: backfills their calls from
// GET /v1/eventCalls so /ventes/appels has recent history. iClosed has no public
// webhook-management endpoint, so the owner configures the token-scoped webhook
// URL shown in the connected integration card. New calls normally arrive
// through that receiver. The calls page also requests a small UPCOMING-only
// reconciliation in a separate worker when it needs a freshness check.
//
// Idempotent per CLAUDE.md: the backfill upserts with onConflictDoNothing so a
// replay never clobbers a call the closer already dispositioned. Any failure
// sets initialSyncStatus to "failed" (never left stuck on "pending"), and a
// plan/permission rejection is treated as permanent (no pointless retries).
export const syncIclosedAccount = inngest.createFunction(
  { id: "sync-iclosed-account", triggers: [iclosedAccountConnected] },
  async ({ event, step }) => {
    const { userId, connectionId } = event.data;

    const connection = await step.run("load-connection", async () => {
      const [row] = await db
        .select()
        .from(iclosedConnections)
        .where(and(eq(iclosedConnections.id, connectionId), eq(iclosedConnections.userId, userId)))
        .limit(1);
      if (!row) throw new NonRetriableError(`No iClosed connection for event ${connectionId}`);
      return row;
    });

    try {
      const apiKey = decrypt(connection.apiKeyEncrypted);
      const inserted = await step.run("backfill-calls", () => backfillIclosedCalls(userId, apiKey));

      await step.run("mark-sync-completed", async () => {
        await db
          .update(iclosedConnections)
          .set({ initialSyncStatus: "completed", initialSyncCompletedAt: new Date() })
          .where(eq(iclosedConnections.id, connectionId));
      });

      revalidateBusinessData();
      await track("iclosed_sync_completed", userId, { calls_backfilled: inserted });
    } catch (error) {
      const noAccess = error instanceof IclosedNoApiAccessError;
      await step.run("mark-sync-failed", async () => {
        await db
          .update(iclosedConnections)
          .set({
            // "failed" surfaces the amber/red banner instead of an infinite
            // "en cours". The reason is distinguished in analytics + the UI copy.
            initialSyncStatus: noAccess ? "no_api_access" : "failed",
            initialSyncCompletedAt: new Date(),
          })
          .where(eq(iclosedConnections.id, connectionId));
      });
      await track("iclosed_sync_failed", userId, { step: "backfill-calls", reason: noAccess ? "no_api_access" : "error" });

      // A plan/permission rejection won't fix itself on retry — stop here.
      if (noAccess) return;
      throw error;
    }
  }
);
