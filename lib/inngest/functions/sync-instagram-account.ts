import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { instagramConnections } from "@/db/schema";
import { track } from "@/lib/analytics";
import { decrypt } from "@/lib/crypto";
import { backfillInstagramPosts } from "@/lib/instagram/backfill";
import { InstagramNotProfessionalAccountError } from "@/lib/instagram/client";
import { instagramAccountConnected, instagramBackfillContinue, inngest } from "@/lib/inngest/client";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// Runs once when a user connects Instagram: backfills their recent media +
// insights so /acquisition/contenu populates. Idempotent (the backfill
// upserts, safe to replay). A personal (non-Professional) account is a
// permanent rejection, not retried; any other failure marks "failed" so the
// UI never hangs on "pending" — same three-way branching as
// sync-iclosed-account.ts / sync-calendly-account.ts. Keeping numbers fresh
// afterwards is refresh-instagram-insights.ts's recurring cron, not this
// one-time job.
export const syncInstagramAccount = inngest.createFunction(
  { id: "sync-instagram-account", triggers: [instagramAccountConnected] },
  async ({ event, step }) => {
    const { userId } = event.data;

    const connection = await step.run("load-connection", async () => {
      const [row] = await db.select().from(instagramConnections).where(eq(instagramConnections.userId, userId)).limit(1);
      if (!row) throw new NonRetriableError(`No Instagram connection for user ${userId}`);
      return row;
    });

    const accessToken = decrypt(connection.accessTokenEncrypted);

    try {
      const result = await step.run("backfill-posts", () => backfillInstagramPosts(userId, accessToken));

      await step.run("mark-sync-completed", async () => {
        await db
          .update(instagramConnections)
          .set({ initialSyncStatus: "completed", initialSyncCompletedAt: new Date(), lastInsightsSyncAt: new Date() })
          .where(eq(instagramConnections.userId, userId));
      });

      // A large account's history can exceed this invocation's time budget
      // (see protocol.ts's INSTAGRAM_BACKFILL_TIME_BUDGET_MS) — the
      // connection is still marked "completed" above (it IS usable, just
      // not exhaustive yet) and continueInstagramBackfill picks up the rest
      // in the background, re-chaining itself until the whole backlog is
      // caught up.
      if (!result.completed) {
        await step.sendEvent("continue-backfill", instagramBackfillContinue.create({ userId }));
      }

      revalidateBusinessData();
      await track("instagram_sync_completed", userId, { posts_backfilled: result.processed });
    } catch (error) {
      const notProfessional = error instanceof InstagramNotProfessionalAccountError;
      await step.run("mark-sync-failed", async () => {
        await db
          .update(instagramConnections)
          .set({
            initialSyncStatus: notProfessional ? "no_api_access" : "failed",
            initialSyncCompletedAt: new Date(),
          })
          .where(eq(instagramConnections.userId, userId));
      });
      await track("instagram_sync_failed", userId, { step: "backfill-posts", reason: notProfessional ? "no_api_access" : "error" });

      if (notProfessional) return;
      throw error;
    }
  }
);
