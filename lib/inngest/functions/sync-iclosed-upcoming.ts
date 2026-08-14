import { and, eq, isNull, lt, or } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { iclosedConnections } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { IclosedNoApiAccessError } from "@/lib/iclosed/client";
import { reconcileIclosedUpcomingCalls } from "@/lib/iclosed/reconcile";
import { iclosedUpcomingSyncRequested, inngest } from "@/lib/inngest/client";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// The browser can request a check on page open, focus, and on a long-lived
// visible tab. This database-claimed cooldown means those signals result in
// at most one iClosed UPCOMING request per account every five minutes.
const UPCOMING_SYNC_COOLDOWN_MS = 5 * 60 * 1000;

export const syncIclosedUpcoming = inngest.createFunction(
  { id: "sync-iclosed-upcoming", concurrency: { limit: 1, key: "event.data.userId" }, retries: 2, triggers: [iclosedUpcomingSyncRequested] },
  async ({ event, step }) => {
    const { userId, connectionId } = event.data;
    const claimed = await step.run("claim-upcoming-sync", async () => {
      const now = new Date();
      const cutoff = new Date(now.getTime() - UPCOMING_SYNC_COOLDOWN_MS);
      const [row] = await db
        .update(iclosedConnections)
        .set({ lastUpcomingSyncAttemptAt: now })
        .where(
          and(
            eq(iclosedConnections.id, connectionId),
            eq(iclosedConnections.userId, userId),
            or(
              isNull(iclosedConnections.lastUpcomingSyncAttemptAt),
              lt(iclosedConnections.lastUpcomingSyncAttemptAt, cutoff),
            ),
          ),
        )
        .returning({ id: iclosedConnections.id });
      return Boolean(row);
    });

    if (!claimed) {
      return { fetched: 0, inserted: 0, updated: 0, skipped: "cooldown" as const };
    }

    try {
      const result = await step.run("reconcile-upcoming-calls", async () => {
        const [connection] = await db
          .select({ apiKeyEncrypted: iclosedConnections.apiKeyEncrypted })
          .from(iclosedConnections)
          .where(and(eq(iclosedConnections.id, connectionId), eq(iclosedConnections.userId, userId)))
          .limit(1);
        if (!connection) throw new NonRetriableError("No iClosed connection for upcoming reconciliation");

        // The decrypted key stays inside this step. Only counters are returned
        // to Inngest, so the BYOK secret never becomes a step result.
        return reconcileIclosedUpcomingCalls(userId, decrypt(connection.apiKeyEncrypted));
      });

      if (result.inserted > 0 || result.updated > 0) revalidateBusinessData(userId);
      return result;
    } catch (error) {
      // A failed attempt should not suppress the next visible page-open check.
      // Successful attempts keep the timestamp as the cooldown marker.
      await step.run("release-upcoming-sync", async () => {
        await db
          .update(iclosedConnections)
          .set({ lastUpcomingSyncAttemptAt: null })
          .where(and(eq(iclosedConnections.id, connectionId), eq(iclosedConnections.userId, userId)));
      });

      if (error instanceof IclosedNoApiAccessError) {
        return { fetched: 0, inserted: 0, updated: 0, skipped: "no-api-access" as const };
      }
      throw error;
    }
  },
);
