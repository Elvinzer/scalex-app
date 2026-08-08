"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { metaAdAccounts, metaAdsConnections, users } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { requireUserId } from "@/lib/current-user";
import { inngest, metaAdsSyncRequested } from "@/lib/inngest/client";
import { revokeMetaPermissions } from "@/lib/meta-ads/client";
import { syncMetaAdAccounts } from "@/lib/meta-ads/sync";
import { requireOwner } from "@/lib/team/context";

const adAccountIdSchema = z.string().trim().regex(/^(act_)?\d{4,32}$/, "Compte publicitaire invalide.");

export async function selectMetaAdAccount(externalId: string): Promise<{ error: string | null }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const access = await requireOwner(userId);
  if (!access) return { error: "Seul le propriétaire peut choisir le compte publicitaire." };
  const parsed = adAccountIdSchema.safeParse(externalId);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Compte invalide." };

  const normalized = parsed.data.startsWith("act_") ? parsed.data : `act_${parsed.data}`;
  const [connection] = await db
    .select({ id: metaAdsConnections.id, status: metaAdsConnections.status })
    .from(metaAdsConnections)
    .where(eq(metaAdsConnections.userId, access.accountId))
    .limit(1);
  if (!connection) return { error: "La connexion Meta Ads est introuvable. Reconnecte Meta Ads." };
  if (connection.status === "disconnected") return { error: "Reconnecte Meta Ads avant de sélectionner un compte publicitaire." };
  const [account] = await db
    .select({ id: metaAdAccounts.id, canRead: metaAdAccounts.canRead })
    .from(metaAdAccounts)
    .where(and(eq(metaAdAccounts.userId, access.accountId), eq(metaAdAccounts.connectionId, connection.id), eq(metaAdAccounts.externalId, normalized)))
    .limit(1);
  if (!account?.canRead) return { error: "Ce compte publicitaire n'est pas disponible dans ta connexion Meta." };

  await db
    .update(metaAdsConnections)
    .set({ selectedAdAccountId: normalized, initialSyncStatus: "pending", lastSyncError: null, updatedAt: new Date() })
    .where(eq(metaAdsConnections.id, connection.id));
  try {
    await inngest.send(metaAdsSyncRequested.create({ userId: access.accountId }));
  } catch (error) {
    console.error("inngest.send(metaAdsSyncRequested) failed after account selection", error);
  }
  revalidatePath("/integrations");
  revalidatePath("/acquisition/ads");
  return { error: null };
}

export async function refreshMetaAdAccounts(): Promise<{ error: string | null; imported?: number }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const access = await requireOwner(userId);
  if (!access) return { error: "Seul le propriétaire peut actualiser Meta Ads." };
  try {
    const result = await syncMetaAdAccounts(access.accountId);
    revalidatePath("/integrations");
    return { error: null, imported: result.imported };
  } catch {
    return { error: "Impossible de récupérer les comptes publicitaires Meta pour l'instant." };
  }
}

export async function disconnectMetaAds(): Promise<{ error: string | null }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const access = await requireOwner(userId);
  if (!access) return { error: "Seul le propriétaire peut déconnecter Meta Ads." };
  const [connection] = await db
    .select({ encryptedToken: metaAdsConnections.accessTokenEncrypted })
    .from(metaAdsConnections)
    .where(eq(metaAdsConnections.userId, access.accountId))
    .limit(1);
  if (connection?.encryptedToken) {
    try {
      await revokeMetaPermissions(decrypt(connection.encryptedToken));
    } catch (error) {
      console.error("Meta permissions revoke failed, removing local connection anyway", error instanceof Error ? error.message : "unknown");
    }
  }
  await db
    .update(metaAdsConnections)
    .set({
      accessTokenEncrypted: null,
      grantedScopes: [],
      status: "disconnected",
      initialSyncStatus: "disconnected",
      lastSyncError: null,
      updatedAt: new Date(),
    })
    .where(eq(metaAdsConnections.userId, access.accountId));
  await db.update(users).set({ metaAdsConnected: false }).where(eq(users.id, access.accountId));
  revalidatePath("/integrations");
  revalidatePath("/acquisition/ads");
  return { error: null };
}
