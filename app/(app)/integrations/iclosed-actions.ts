"use server";

import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { iclosedConnections, users } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { encrypt } from "@/lib/crypto";
import { requireUserId } from "@/lib/current-user";
import { validateIclosedKey } from "@/lib/iclosed/client";
import { ICLOSED_KEY_PREFIX } from "@/lib/iclosed/protocol";
import { iclosedAccountConnected, iclosedUpcomingSyncRequested, inngest } from "@/lib/inngest/client";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { createClient } from "@/lib/supabase/server";
import { requireOwner, requirePermission } from "@/lib/team/context";

// Connecting/disconnecting iClosed handles the client's API key (a secret) and
// registers a webhook on their account — owner-only, never delegable to a role,
// same boundary as Stripe Connect. iClosed uses a static API key (not OAuth),
// so this mirrors the Anthropic BYOK "paste + encrypt" flow, not the Stripe
// OAuth redirect.

const apiKeySchema = z
  .string()
  .trim()
  .regex(new RegExp(`^${ICLOSED_KEY_PREFIX}`), `La clé doit commencer par ${ICLOSED_KEY_PREFIX}`);

export async function connectIclosed(formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const access = await requireOwner(userId);
  if (!access) {
    return { error: "Seul le propriétaire du compte peut connecter iClosed." };
  }

  // Gate: any active/trialing subscription unlocks the tracking (« même le 1er
  // palier le permet »).
  const subscribed = await hasActiveSubscription(access.accountId);
  if (!subscribed) {
    return { error: "Le tracking des appels nécessite un abonnement actif. Active ton abonnement puis réessaie." };
  }

  const parsed = apiKeySchema.safeParse(formData.get("apiKey"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Clé invalide" };
  }

  const validation = await validateIclosedKey(parsed.data);
  if (validation === "invalid") {
    return {
      error: "Cette clé iClosed ne fonctionne pas. Vérifie-la dans iClosed (Settings → Developer → API Keys) et réessaie.",
    };
  }
  if (validation === "no_api_access") {
    return {
      error:
        "Ta clé est reconnue, mais ton plan iClosed ne donne pas accès à l'API (plan Business ou Enterprise requis). Vérifie ton plan sur iclosed.io — ou demande au support iClosed d'activer l'accès API — puis réessaie.",
    };
  }
  if (validation === "unknown") {
    return { error: "Impossible de vérifier ta clé pour l'instant (souci réseau côté iClosed). Réessaie dans un instant." };
  }

  const values = {
    userId: access.accountId,
    apiKeyEncrypted: encrypt(parsed.data),
    webhookToken: randomBytes(24).toString("hex"),
    // Reset on every (re)connect — the Inngest job registers a fresh webhook
    // and flips the status to "completed"/"failed".
    webhookId: null,
    webhookSecretEncrypted: null,
    initialSyncStatus: "pending" as const,
    lastUpcomingSyncAttemptAt: null,
  };

  const [connection] = await db
    .insert(iclosedConnections)
    .values(values)
    .onConflictDoUpdate({
      target: iclosedConnections.userId,
      set: { ...values, connectedAt: new Date(), initialSyncCompletedAt: null },
    })
    .returning({ id: iclosedConnections.id });
  if (!connection) throw new Error("iClosed connection could not be saved");

  await db.update(users).set({ iclosedConnected: true }).where(eq(users.id, access.accountId));

  // Best-effort — the connection is already durably saved. An Inngest hiccup
  // must not fail a saved connection; the webhook just won't auto-register /
  // backfill until reconnect.
  try {
    await inngest.send(iclosedAccountConnected.create({ userId: access.accountId, connectionId: connection.id }));
  } catch (error) {
    console.error("inngest.send(iclosedAccountConnected) failed, iClosed connection saved anyway", error);
  }

  revalidatePath("/integrations");
  revalidatePath("/ventes/appels");
  revalidateBusinessData(access.accountId);
  return { error: null };
}

// Called automatically by the calls page. It only enqueues a scoped Inngest
// event; the worker owns the five-minute database cooldown and the provider
// request, so a tab refresh never blocks on iClosed or exposes a BYOK secret.
export async function requestIclosedUpcomingSync(): Promise<{ queued: boolean }> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return { queued: false };
  }

  const access = await requirePermission(userId, "ventes:appels");
  if (!access) return { queued: false };

  const [connection] = await db
    .select({ id: iclosedConnections.id })
    .from(iclosedConnections)
    .where(eq(iclosedConnections.userId, access.accountId))
    .limit(1);
  if (!connection) return { queued: false };

  try {
    await inngest.send(
      iclosedUpcomingSyncRequested.create({
        userId: access.accountId,
        connectionId: connection.id,
      }),
    );
    return { queued: true };
  } catch (error) {
    console.error("inngest.send(iclosedUpcomingSyncRequested) failed", error);
    return { queued: false };
  }
}

export async function disconnectIclosed(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const access = await requireOwner(userId);
  if (!access) {
    return { error: "Seul le propriétaire du compte peut déconnecter iClosed." };
  }

  // Freeze, never erase: past sales_calls stay as historical funnel data
  // (deliberately not deleted here) — only the live link is removed.
  await db.delete(iclosedConnections).where(eq(iclosedConnections.userId, access.accountId));
  await db.update(users).set({ iclosedConnected: false }).where(eq(users.id, access.accountId));

  revalidatePath("/integrations");
  revalidatePath("/ventes/appels");
  revalidateBusinessData(access.accountId);
  return { error: null };
}
