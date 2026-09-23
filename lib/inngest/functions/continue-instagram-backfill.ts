import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { instagramConnections } from "@/db/schema";
import { tryDecrypt } from "@/lib/crypto";
import { backfillInstagramPosts } from "@/lib/instagram/backfill";
import { InstagramNotProfessionalAccountError } from "@/lib/instagram/client";
import { instagramBackfillContinue, inngest } from "@/lib/inngest/client";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// Resumes a backfill that stopped early because it hit its time budget (see
// protocol.ts's INSTAGRAM_BACKFILL_TIME_BUDGET_MS) — triggered by
// sync-instagram-account.ts and refresh-instagram-insights.ts whenever
// backfillInstagramPosts reports `completed: false`, and re-triggers ITSELF
// the same way until the whole backlog is caught up. Each run omits
// sinceDate (same as the initial connect backfill) — the point of this
// chain is specifically to catch up media never seen before, regardless of
// age, and backfillInstagramPosts's onConflictDoUpdate upserts make
// repeated/overlapping runs safe either way.
export const continueInstagramBackfill = inngest.createFunction(
  { id: "continue-instagram-backfill", concurrency: { limit: 1, key: "event.data.userId" }, triggers: [instagramBackfillContinue] },
  async ({ event, step }) => {
    const { userId, connectionId } = event.data;
    if (!connectionId) return { skipped: true, reason: "missing_connection_id" };

    const connection = await step.run("load-connection", async () => {
      const [row] = await db
        .select()
        .from(instagramConnections)
        .where(and(eq(instagramConnections.id, connectionId), eq(instagramConnections.userId, userId)))
        .limit(1);
      return row ?? null;
    });
    if (!connection) return { skipped: true, reason: "connection_removed" };

    const accessToken = tryDecrypt(connection.accessTokenEncrypted);
    if (!accessToken) {
      await step.run("mark-token-unreadable", async () => {
        await db
          .update(instagramConnections)
          .set({ initialSyncStatus: "token_unreadable" })
          .where(eq(instagramConnections.id, connectionId));
      });
      return { skipped: true, reason: "token_unreadable" };
    }

    try {
      const result = await step.run("continue-backfill", () => backfillInstagramPosts(userId, accessToken));

      await step.run("update-sync-timestamp", async () => {
        await db.update(instagramConnections).set({ lastInsightsSyncAt: new Date() }).where(eq(instagramConnections.id, connectionId));
      });

      if (!result.completed) {
        await step.sendEvent("chain-continue", instagramBackfillContinue.create({ userId, connectionId }));
      }

      revalidateBusinessData(userId);
      return result;
    } catch (error) {
      const notProfessional = error instanceof InstagramNotProfessionalAccountError;
      await step.run("mark-sync-failed", async () => {
        await db
          .update(instagramConnections)
          .set({ initialSyncStatus: notProfessional ? "no_api_access" : "failed" })
          .where(eq(instagramConnections.id, connectionId));
      });
      if (notProfessional) return { skipped: true, reason: "no_api_access" };
      throw error;
    }
  }
);
