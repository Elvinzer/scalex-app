import { eq } from "drizzle-orm";
import { cron } from "inngest";

import { db } from "@/db";
import { instagramConnections } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { backfillInstagramPosts, insightsRefreshSinceDate } from "@/lib/instagram/backfill";
import { InstagramNotProfessionalAccountError, refreshLongLivedToken } from "@/lib/instagram/client";
import { INSTAGRAM_INSIGHTS_REFRESH_WINDOW_DAYS, INSTAGRAM_TOKEN_REFRESH_MARGIN_DAYS } from "@/lib/instagram/protocol";
import { instagramBackfillContinue, inngest } from "@/lib/inngest/client";

// Recurring job (every 6h) — unlike iClosed/Calendly's call data (finalized
// at booking time), Instagram's organic insight numbers (reach, likes,
// saves...) keep climbing for days after a post goes up, so a one-time
// connect backfill isn't enough to keep /acquisition/contenu accurate. Also
// refreshes the long-lived token before it expires (~60 days) — Meta only
// allows refreshing a token that hasn't fully expired yet, so this must run
// well ahead of that deadline. Per-account step.run isolation (same pattern
// as snapshot-scale-score.ts) so one account's failure never blocks another.
export const refreshInstagramInsights = inngest.createFunction(
  { id: "refresh-instagram-insights", triggers: [cron("0 */6 * * *")] },
  async ({ step }) => {
    const connections = await step.run("load-connections", async () => db.select().from(instagramConnections));

    const results = await Promise.all(
      connections.map((connection) =>
        step.run(`refresh-${connection.userId}`, async () => {
          const refreshDeadline = new Date();
          refreshDeadline.setDate(refreshDeadline.getDate() + INSTAGRAM_TOKEN_REFRESH_MARGIN_DAYS);
          const tokenExpiresAt = new Date(connection.tokenExpiresAt);

          if (tokenExpiresAt <= new Date()) {
            await db
              .update(instagramConnections)
              .set({ initialSyncStatus: "token_expired" })
              .where(eq(instagramConnections.userId, connection.userId));
            return { userId: connection.userId, skipped: true, reason: "token_expired" };
          }

          let accessToken = decrypt(connection.accessTokenEncrypted);

          if (tokenExpiresAt <= refreshDeadline) {
            try {
              const refreshed = await refreshLongLivedToken(accessToken);
              accessToken = refreshed.accessToken;
              await db
                .update(instagramConnections)
                .set({
                  accessTokenEncrypted: encrypt(refreshed.accessToken),
                  tokenExpiresAt: new Date(Date.now() + refreshed.expiresInSeconds * 1000),
                })
                .where(eq(instagramConnections.userId, connection.userId));
            } catch (error) {
              console.error(`Instagram token refresh failed for user ${connection.userId}, continuing with current token`, error);
            }
          }

          try {
            const result = await backfillInstagramPosts(
              connection.userId,
              accessToken,
              insightsRefreshSinceDate(INSTAGRAM_INSIGHTS_REFRESH_WINDOW_DAYS)
            );
            await db
              .update(instagramConnections)
              .set({ initialSyncStatus: "completed", lastInsightsSyncAt: new Date() })
              .where(eq(instagramConnections.userId, connection.userId));
            return { userId: connection.userId, skipped: false, imported: result.processed, needsContinuation: !result.completed };
          } catch (error) {
            const notProfessional = error instanceof InstagramNotProfessionalAccountError;
            await db
              .update(instagramConnections)
              .set({ initialSyncStatus: notProfessional ? "no_api_access" : "failed" })
              .where(eq(instagramConnections.userId, connection.userId));
            return { userId: connection.userId, skipped: true, reason: notProfessional ? "no_api_access" : "error" };
          }
        })
      )
    );

    // Sent at the top level (never inside the per-connection step.run above)
    // — Inngest steps must be called directly in the function body, not
    // nested inside another step's callback. A connection whose backfill
    // hit its time budget (see protocol.ts's
    // INSTAGRAM_BACKFILL_TIME_BUDGET_MS) gets picked up the rest of the way
    // by continueInstagramBackfill instead of waiting for the next 6h cron.
    for (const result of results) {
      if ("needsContinuation" in result && result.needsContinuation) {
        await step.sendEvent(`continue-backfill-${result.userId}`, instagramBackfillContinue.create({ userId: result.userId }));
      }
    }

    const refreshed = results.filter((r) => !r.skipped).length;
    return { total: connections.length, refreshed };
  }
);
