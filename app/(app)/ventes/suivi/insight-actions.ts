"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { stripeConnections } from "@/db/schema";
import { requireUserIdOrError } from "@/lib/current-user";
import { inngest, stripeSyncRequested } from "@/lib/inngest/client";
import { isRateLimited } from "@/lib/rate-limit";
import { requirePermission } from "@/lib/team/context";

const refreshInputSchema = z.object({});

export async function requestStripeInsightsRefresh(): Promise<{ error: string | null }> {
  const userId = await requireUserIdOrError();
  if (typeof userId !== "string") return userId;

  const access = await requirePermission(userId, "ventes:suivi");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const parsed = refreshInputSchema.safeParse({});
  if (!parsed.success) return { error: "Demande invalide." };

  if (isRateLimited(`stripe-insights-refresh:${access.accountId}`, 2, 60_000)) {
    return { error: "Un rafraîchissement est déjà demandé. Réessaie dans une minute." };
  }

  const [connection] = await db
    .select({ id: stripeConnections.id })
    .from(stripeConnections)
    .where(eq(stripeConnections.userId, access.accountId))
    .limit(1);
  if (!connection) return { error: "Connecte Stripe pour rafraîchir les transactions." };

  await db
    .update(stripeConnections)
    .set({ initialSyncStatus: "pending", lastSyncError: null })
    .where(eq(stripeConnections.userId, access.accountId));

  try {
    await inngest.send(stripeSyncRequested.create({ userId: access.accountId }));
  } catch {
    await db
      .update(stripeConnections)
      .set({
        initialSyncStatus: "failed",
        lastSyncError: "La demande de synchronisation n'a pas pu être envoyée. Réessaie plus tard.",
      })
      .where(eq(stripeConnections.userId, access.accountId));
    return { error: "La synchronisation n'a pas pu être démarrée. Réessaie plus tard." };
  }

  revalidatePath("/ventes/suivi");
  return { error: null };
}

export async function getStripeSyncStatus(): Promise<{ status: string | null; error: string | null }> {
  const userId = await requireUserIdOrError();
  if (typeof userId !== "string") return { status: null, error: userId.error };

  const access = await requirePermission(userId, "ventes:suivi");
  if (!access) return { status: null, error: "Tu n'as pas accès à cette section." };

  const [connection] = await db
    .select({ initialSyncStatus: stripeConnections.initialSyncStatus })
    .from(stripeConnections)
    .where(eq(stripeConnections.userId, access.accountId))
    .limit(1);

  return { status: connection?.initialSyncStatus ?? null, error: null };
}
