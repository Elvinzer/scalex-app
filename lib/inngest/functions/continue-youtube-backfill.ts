import { eq } from "drizzle-orm";

import { db } from "@/db";
import { youtubeConnections } from "@/db/schema";
import { YoutubeChannelNotFoundError, YoutubeTokenRevokedError } from "@/lib/youtube/client";
import { youtubeBackfillContinue, inngest } from "@/lib/inngest/client";
import { runYoutubeSync } from "@/lib/youtube/sync";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// Resumes a backfill that stopped early because it hit its time budget (see
// protocol.ts's YOUTUBE_BACKFILL_TIME_BUDGET_MS) — triggered by
// sync-youtube-account.ts and refresh-youtube-insights.ts whenever the
// backfill reports `completed: false`, and re-triggers ITSELF the same way
// until the whole backlog is caught up. Each run omits sinceDate (same as
// the initial connect backfill) — the point of this chain is specifically
// to catch up videos never seen before, regardless of age; backfillYoutubeVideos's
// onConflictDoUpdate upserts make repeated/overlapping runs safe either way.
export const continueYoutubeBackfill = inngest.createFunction(
  { id: "continue-youtube-backfill", concurrency: { limit: 1, key: "event.data.userId" }, triggers: [youtubeBackfillContinue] },
  async ({ event, step }) => {
    const { userId } = event.data;

    const connection = await step.run("load-connection", async () => {
      const [row] = await db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, userId)).limit(1);
      return row ?? null;
    });
    if (!connection) return { skipped: true, reason: "connection_removed" };

    try {
      const result = await step.run("continue-backfill", () => runYoutubeSync(connection));

      await step.run("update-sync-timestamp", async () => {
        await db.update(youtubeConnections).set({ lastAnalyticsSyncAt: new Date() }).where(eq(youtubeConnections.userId, userId));
      });

      if (!result.completed) {
        await step.sendEvent("chain-continue", youtubeBackfillContinue.create({ userId }));
      }

      revalidateBusinessData(userId);
      return result;
    } catch (error) {
      const revoked = error instanceof YoutubeTokenRevokedError;
      const noChannel = error instanceof YoutubeChannelNotFoundError;
      await step.run("mark-sync-failed", async () => {
        await db
          .update(youtubeConnections)
          .set({ initialSyncStatus: revoked ? "token_expired" : "failed" })
          .where(eq(youtubeConnections.userId, userId));
      });
      if (noChannel || revoked) return { skipped: true, reason: revoked ? "token_expired" : "no_channel" };
      throw error;
    }
  }
);
