"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { users, youtubeConnections } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { requireOwner, requirePermission } from "@/lib/team/context";
import { YoutubeChannelNotFoundError, YoutubeTokenRevokedError } from "@/lib/youtube/client";
import { YOUTUBE_INSIGHTS_REFRESH_WINDOW_DAYS } from "@/lib/youtube/protocol";
import { insightsRefreshSinceDate } from "@/lib/youtube/backfill";
import { runYoutubeSync } from "@/lib/youtube/sync";
import { revalidateBusinessData } from "@/lib/revalidate-data";

// Connecting/disconnecting YouTube grants OAuth access to the channel's real
// analytics data — owner-only, never delegable, same boundary as Stripe/
// iClosed/Calendly/Instagram. Connecting itself happens via the OAuth
// redirect (app/api/youtube/{connect,callback}), not a form Server Action,
// so only disconnect/refresh live here — mirrors instagram-actions.ts.

export async function disconnectYoutube(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const access = await requireOwner(userId);
  if (!access) {
    return { error: "Seul le propriétaire du compte peut déconnecter YouTube." };
  }

  // Freeze, never erase: past content_posts/youtube_video_insights stay as
  // historical data — only the live link is removed, same rule as
  // disconnectInstagram/disconnectIclosed/disconnectCalendly.
  await db.delete(youtubeConnections).where(eq(youtubeConnections.userId, access.accountId));
  await db.update(users).set({ youtubeConnected: false }).where(eq(users.id, access.accountId));

  revalidatePath("/integrations");
  revalidatePath("/acquisition/contenu");
  revalidateBusinessData(access.accountId);
  return { error: null };
}

// On-demand pull (idempotent), same role as refreshInstagramPosts. Re-syncs
// the recent-video window (see protocol.ts's
// YOUTUBE_INSIGHTS_REFRESH_WINDOW_DAYS) so a manual click stays fast for the
// common case — backfillYoutubeVideos also always picks up any video never
// seen before regardless of age, so a video the very first connect-time sync
// missed gets recovered here too. Available to the owner and team members
// with the acquisition:contenu permission.
export async function refreshYoutubeVideos(): Promise<{ error: string | null; imported?: number; completed?: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const access = await requirePermission(userId, "acquisition:contenu");
  if (!access) {
    return { error: "Tu n'as pas accès à cette section." };
  }
  const { accountId } = access;

  const [connection] = await db.select().from(youtubeConnections).where(eq(youtubeConnections.userId, accountId)).limit(1);
  if (!connection) {
    return { error: "YouTube n'est pas connecté." };
  }

  try {
    const result = await runYoutubeSync(connection, insightsRefreshSinceDate(YOUTUBE_INSIGHTS_REFRESH_WINDOW_DAYS));
    await db
      .update(youtubeConnections)
      .set({ initialSyncStatus: "completed", initialSyncCompletedAt: new Date(), lastAnalyticsSyncAt: new Date() })
      .where(eq(youtubeConnections.userId, accountId));

    revalidatePath("/acquisition/contenu");
    revalidateBusinessData(accountId);
    return { error: null, imported: result.processed, completed: result.completed };
  } catch (error) {
    const revoked = error instanceof YoutubeTokenRevokedError;
    const noChannel = error instanceof YoutubeChannelNotFoundError;
    await db
      .update(youtubeConnections)
      .set({ initialSyncStatus: revoked ? "token_expired" : "failed", initialSyncCompletedAt: new Date() })
      .where(eq(youtubeConnections.userId, accountId));
    revalidatePath("/acquisition/contenu");
    return {
      error: revoked
        ? "La connexion Google a expiré ou a été révoquée — déconnecte puis reconnecte YouTube."
        : noChannel
          ? "Aucune chaîne YouTube n'est associée à ce compte Google."
          : "La synchronisation a échoué. Réessaie dans un instant.",
    };
  }
}
