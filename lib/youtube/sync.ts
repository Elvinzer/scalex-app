import { eq } from "drizzle-orm";

import { db } from "@/db";
import { youtubeConnections } from "@/db/schema";
import { track } from "@/lib/analytics";
import { decrypt, encrypt } from "@/lib/crypto";
import { requireEnv } from "@/lib/utils";

import { backfillYoutubeDeepInsights, backfillYoutubeVideos, type BackfillResult } from "./backfill";
import { fetchChannel, fetchYoutubeChannelInsights, refreshAccessToken } from "./client";
import { rebuildYoutubeContentRecommendations } from "./recommendations";
import { syncYoutubeReporting } from "./reporting";

export type YoutubeConnectionRow = typeof youtubeConnections.$inferSelect;

// Only the two fields runYoutubeSync actually reads — deliberately narrower
// than the full row. Inngest's step.run serializes its return value to JSON
// (see the Inngest functions in lib/inngest/functions/*-youtube-*), which
// turns every Date column into a string; a parameter typed as the full
// YoutubeConnectionRow would reject that serialized shape even though only
// these two string fields are ever used here.
export type YoutubeSyncConnection = Pick<YoutubeConnectionRow, "userId" | "refreshTokenEncrypted">;

export type YoutubeSyncOptions = {
  includeReporting?: boolean;
  includeEnrichment?: boolean;
  includeChannelInsights?: boolean;
};

// Shared orchestration for every YouTube sync entry point (the "Rafraîchir"
// Server Action, the one-time connect job, the recurring cron, and the
// backfill continuation chain): refreshes the short-lived access token via
// the stored refresh token — unlike Instagram's days-long refresh margin,
// this runs on EVERY sync since the access token is only ~1h (see
// protocol.ts) — then re-fetches the channel snapshot (subscriberCount/
// viewCountTotal/title/thumbnail, kept fresh the same way Instagram
// refreshes its username) before running the video backfill. Persists the
// refreshed access token + channel snapshot regardless of backfill outcome,
// so the next call always starts from a valid token. Throws
// YoutubeTokenRevokedError/YoutubeChannelNotFoundError (from
// lib/youtube/client.ts) for callers to branch on, same as
// InstagramNotProfessionalAccountError.
export async function runYoutubeSync(
  connection: YoutubeSyncConnection,
  sinceDate?: Date,
  options: YoutubeSyncOptions = {}
): Promise<BackfillResult> {
  const clientId = requireEnv("YOUTUBE_CLIENT_ID");
  const clientSecret = requireEnv("YOUTUBE_CLIENT_SECRET");
  const refreshToken = decrypt(connection.refreshTokenEncrypted);

  const refreshed = await refreshAccessToken(refreshToken, clientId, clientSecret);
  const accessToken = refreshed.accessToken;
  const tokenExpiresAt = new Date(Date.now() + refreshed.expiresInSeconds * 1000);

  const channel = await fetchChannel(accessToken);

  await db
    .update(youtubeConnections)
    .set({
      channelTitle: channel.title,
      channelThumbnailUrl: channel.thumbnailUrl,
      subscriberCount: channel.subscriberCount,
      viewCountTotal: channel.viewCountTotal,
      accessTokenEncrypted: encrypt(accessToken),
      tokenExpiresAt,
    })
    .where(eq(youtubeConnections.userId, connection.userId));

  const result = await backfillYoutubeVideos(connection.userId, accessToken, channel.uploadsPlaylistId, channel.publishedAt, sinceDate);

  if (options.includeChannelInsights !== false) {
    try {
      const channelInsights = await fetchYoutubeChannelInsights(accessToken, channel.publishedAt);
      if (channelInsights.trafficSourcesAvailable) {
        await db
          .update(youtubeConnections)
          .set({ channelTrafficSources: channelInsights.trafficSources, channelTrafficSourcesFetchedAt: new Date() })
          .where(eq(youtubeConnections.userId, connection.userId));
      }
      if (channelInsights.searchTermsAvailable) {
        await db
          .update(youtubeConnections)
          .set({ channelSearchTerms: channelInsights.searchTerms, channelSearchTermsFetchedAt: new Date() })
          .where(eq(youtubeConnections.userId, connection.userId));
      }
      console.log(
        `[youtube] channel insights for ${connection.userId}: ${channelInsights.trafficSources.length} traffic rows, ${channelInsights.searchTerms.length} search terms`
      );
    } catch (error) {
      console.error(`[youtube] channel insights for ${connection.userId} failed, existing snapshot kept`, error);
    }
  }

  if (options.includeReporting !== false) {
    try {
      await db
        .update(youtubeConnections)
        .set({ reportingSyncStatus: "syncing", reportingLastError: null })
        .where(eq(youtubeConnections.userId, connection.userId));
      const reporting = await syncYoutubeReporting(connection.userId, channel.channelId, accessToken);
      await db
        .update(youtubeConnections)
        .set({
          reportingSyncStatus: reporting.status,
          reportingLastSyncAt: new Date(),
          reportingLastError:
            reporting.status === "failed" ? "YouTube reach data needs another synchronization" : null,
        })
        .where(eq(youtubeConnections.userId, connection.userId));
      console.log(
        `[youtube] bulk reports for ${connection.userId}: ${reporting.downloaded} downloaded, ${reporting.rows} rows imported, status ${reporting.status}`
      );
    } catch (error) {
      await db
        .update(youtubeConnections)
        .set({ reportingSyncStatus: "failed", reportingLastError: "YouTube Reporting import failed" })
        .where(eq(youtubeConnections.userId, connection.userId));
      console.error(`[youtube] bulk reports for ${connection.userId} failed, sync itself unaffected`, error);
    }
  }

  if (options.includeEnrichment !== false) {
    // Deep Analytics run from the rows the backfill just wrote, so they need
    // it to have happened first. Isolated: this is enrichment for the Contenu
    // insights, never a reason to fail a sync that already stored the
    // headline metrics successfully.
    try {
      const deep = await backfillYoutubeDeepInsights(connection.userId, accessToken, channel.publishedAt);
      console.log(`[youtube] deep insights for ${connection.userId}: ${deep.processed} fetched, ${deep.skipped} skipped`);
    } catch (error) {
      console.error(`[youtube] deep insights for ${connection.userId} failed, sync itself unaffected`, error);
    }

    // Recommendations are a derived product of the freshly upserted videos +
    // attribution rows. An AI provider outage must never make a successful YouTube
    // analytics sync fail, so this enrichment is isolated just like deep
    // insights above.
    try {
      const recommendations = await rebuildYoutubeContentRecommendations(connection.userId);
      if (recommendations.state === "generated") {
        await track("content_reco_generated", connection.userId, { count: recommendations.count });
      }
    } catch (error) {
      console.error(`[youtube] content recommendations for ${connection.userId} failed, sync itself unaffected`, error);
    }
  }

  return result;
}
