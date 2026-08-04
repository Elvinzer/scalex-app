"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { instagramConnections, users } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { backfillInstagramPosts, insightsRefreshSinceDate } from "@/lib/instagram/backfill";
import { InstagramNotProfessionalAccountError } from "@/lib/instagram/client";
import { INSTAGRAM_INSIGHTS_REFRESH_WINDOW_DAYS } from "@/lib/instagram/protocol";
import { createClient } from "@/lib/supabase/server";
import { requireOwner, requirePermission } from "@/lib/team/context";

// Connecting/disconnecting Instagram grants OAuth access to the account's
// real content data — owner-only, never delegable, same boundary as Stripe/
// iClosed/Calendly. Connecting itself happens via the OAuth redirect
// (app/api/instagram/{connect,callback}), not a form Server Action, so only
// disconnect/refresh live here.

export async function disconnectInstagram(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const access = await requireOwner(userId);
  if (!access) {
    return { error: "Seul le propriétaire du compte peut déconnecter Instagram." };
  }

  // Freeze, never erase: past content_posts/instagram_post_insights stay as
  // historical data (deliberately not deleted here) — only the live link is
  // removed, same rule as disconnectIclosed/disconnectCalendly.
  await db.delete(instagramConnections).where(eq(instagramConnections.userId, access.accountId));
  await db.update(users).set({ instagramConnected: false }).where(eq(users.id, access.accountId));

  revalidatePath("/integrations");
  revalidatePath("/acquisition/contenu");
  return { error: null };
}

// On-demand pull (idempotent), same role as refreshIclosedCalls/
// refreshCalendlyCalls. Bounded to the same recent-media window as the
// recurring cron (see protocol.ts's INSTAGRAM_INSIGHTS_REFRESH_WINDOW_DAYS)
// rather than a full re-backfill, so a manual click stays fast and within
// Meta's rate limits even for accounts with a long post history. Available
// to the owner and team members with the acquisition:contenu permission.
export async function refreshInstagramPosts(): Promise<{ error: string | null; imported?: number }> {
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

  const [connection] = await db.select().from(instagramConnections).where(eq(instagramConnections.userId, accountId)).limit(1);
  if (!connection) {
    return { error: "Instagram n'est pas connecté." };
  }

  const accessToken = decrypt(connection.accessTokenEncrypted);
  try {
    const imported = await backfillInstagramPosts(accountId, accessToken, insightsRefreshSinceDate(INSTAGRAM_INSIGHTS_REFRESH_WINDOW_DAYS));
    await db
      .update(instagramConnections)
      .set({ initialSyncStatus: "completed", initialSyncCompletedAt: new Date(), lastInsightsSyncAt: new Date() })
      .where(eq(instagramConnections.userId, accountId));
    revalidatePath("/acquisition/contenu");
    return { error: null, imported };
  } catch (error) {
    const notProfessional = error instanceof InstagramNotProfessionalAccountError;
    await db
      .update(instagramConnections)
      .set({ initialSyncStatus: notProfessional ? "no_api_access" : "failed", initialSyncCompletedAt: new Date() })
      .where(eq(instagramConnections.userId, accountId));
    revalidatePath("/acquisition/contenu");
    return {
      error: notProfessional
        ? "Ce compte Instagram n'est plus un compte Professionnel — repasse-le en Business ou Créateur puis reconnecte."
        : "La synchronisation a échoué. Réessaie dans un instant.",
    };
  }
}
