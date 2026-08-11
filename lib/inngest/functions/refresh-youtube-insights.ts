import { eq } from "drizzle-orm";
import { cron } from "inngest";

import { db } from "@/db";
import { youtubeConnections } from "@/db/schema";
import { YoutubeChannelNotFoundError, YoutubeTokenRevokedError } from "@/lib/youtube/client";
import { insightsRefreshSinceDate } from "@/lib/youtube/backfill";
import { YOUTUBE_INSIGHTS_REFRESH_WINDOW_DAYS } from "@/lib/youtube/protocol";
import { youtubeBackfillContinue, inngest } from "@/lib/inngest/client";
import { runYoutubeSync } from "@/lib/youtube/sync";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// Recurring job (every 6h, same cadence as refresh-instagram-insights) —
// watch-time/retention numbers keep evolving for days after a video goes
// up, so a one-time connect backfill isn't enough to keep
// /acquisition/contenu accurate. Also refreshes the access token on every
// run via runYoutubeSync (the ~1h token has no "margin" concept like
// Instagram's 60-day one — every run refreshes regardless). Per-account
// step.run isolation (same pattern as refresh-instagram-insights.ts) so one
// account's failure never blocks another.
export const refreshYoutubeInsights = inngest.createFunction(
  { id: "refresh-youtube-insights", triggers: [cron("15 */6 * * *")] },
  async ({ step }) => {
    const connections = await step.run("load-connections", async () => db.select().from(youtubeConnections));

    const results = await Promise.all(
      connections.map((connection) =>
        step.run(`refresh-${connection.userId}`, async () => {
          try {
            const result = await runYoutubeSync(connection, insightsRefreshSinceDate(YOUTUBE_INSIGHTS_REFRESH_WINDOW_DAYS));
            await db
              .update(youtubeConnections)
              .set({ initialSyncStatus: "completed", lastAnalyticsSyncAt: new Date() })
              .where(eq(youtubeConnections.userId, connection.userId));
            return { userId: connection.userId, skipped: false, imported: result.processed, needsContinuation: !result.completed };
          } catch (error) {
            const revoked = error instanceof YoutubeTokenRevokedError;
            const noChannel = error instanceof YoutubeChannelNotFoundError;
            await db
              .update(youtubeConnections)
              .set({ initialSyncStatus: revoked ? "token_expired" : "failed" })
              .where(eq(youtubeConnections.userId, connection.userId));
            return { userId: connection.userId, skipped: true, reason: revoked ? "token_expired" : noChannel ? "no_channel" : "error" };
          }
        })
      )
    );

    // Sent at the top level (never inside the per-connection step.run above)
    // — Inngest steps must be called directly in the function body, not
    // nested inside another step's callback. A connection whose backfill
    // hit its time budget gets picked up the rest of the way by
    // continueYoutubeBackfill instead of waiting for the next 6h cron.
    for (const result of results) {
      if ("needsContinuation" in result && result.needsContinuation) {
        await step.sendEvent(`continue-backfill-${result.userId}`, youtubeBackfillContinue.create({ userId: result.userId }));
      }
    }

    const refreshed = results.filter((r) => !r.skipped).length;
    if (refreshed > 0) revalidateBusinessData();
    return { total: connections.length, refreshed };
  }
);
