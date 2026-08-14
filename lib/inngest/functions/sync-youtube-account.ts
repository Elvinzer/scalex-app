import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/db";
import { youtubeConnections } from "@/db/schema";
import { track } from "@/lib/analytics";
import { YoutubeChannelNotFoundError, YoutubeTokenRevokedError } from "@/lib/youtube/client";
import { youtubeAccountConnected, youtubeBackfillContinue, inngest } from "@/lib/inngest/client";
import { runYoutubeSync } from "@/lib/youtube/sync";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// Runs once when a user connects YouTube: backfills their uploaded videos +
// analytics so /acquisition/contenu populates. Idempotent (the backfill
// upserts, safe to replay). A channel-less Google account is a permanent
// rejection, not retried; any other failure marks "failed" so the UI never
// hangs on "pending" — same three-way branching as sync-instagram-account.ts.
// Keeping numbers fresh afterwards is refresh-youtube-insights.ts's
// recurring cron, not this one-time job.
export const syncYoutubeAccount = inngest.createFunction(
  { id: "sync-youtube-account", concurrency: { limit: 1, key: "event.data.userId" }, triggers: [youtubeAccountConnected] },
  async ({ event, step }) => {
    const { userId } = event.data;

    const connection = await step.run("load-connection", async () => {
      const [row] = await db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, userId)).limit(1);
      if (!row) throw new NonRetriableError(`No YouTube connection for user ${userId}`);
      return row;
    });

    try {
      const result = await step.run("backfill-videos", () => runYoutubeSync(connection));

      await step.run("mark-sync-completed", async () => {
        await db
          .update(youtubeConnections)
          .set({ initialSyncStatus: "completed", initialSyncCompletedAt: new Date(), lastAnalyticsSyncAt: new Date() })
          .where(eq(youtubeConnections.userId, userId));
      });

      // A large channel's history can exceed this invocation's time budget
      // (see protocol.ts's YOUTUBE_BACKFILL_TIME_BUDGET_MS) — the connection
      // is still marked "completed" above (it IS usable, just not
      // exhaustive yet) and continueYoutubeBackfill picks up the rest in the
      // background, re-chaining itself until the whole backlog is caught up.
      if (!result.completed) {
        await step.sendEvent("continue-backfill", youtubeBackfillContinue.create({ userId }));
      }

      revalidateBusinessData(userId);
      await track("youtube_sync_completed", userId, { videos_backfilled: result.processed });
    } catch (error) {
      const revoked = error instanceof YoutubeTokenRevokedError;
      const noChannel = error instanceof YoutubeChannelNotFoundError;
      await step.run("mark-sync-failed", async () => {
        await db
          .update(youtubeConnections)
          .set({
            initialSyncStatus: revoked ? "token_expired" : "failed",
            initialSyncCompletedAt: new Date(),
          })
          .where(eq(youtubeConnections.userId, userId));
      });
      await track("youtube_sync_failed", userId, { step: "backfill-videos", reason: revoked ? "token_expired" : noChannel ? "no_channel" : "error" });

      if (noChannel || revoked) return;
      throw error;
    }
  }
);
