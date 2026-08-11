"use server";

import { randomBytes } from "node:crypto";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { calendlyConnections, users } from "@/db/schema";
import { hasActiveSubscription } from "@/lib/billing/plan-gate";
import { backfillCalendlyCalls } from "@/lib/calendly/backfill";
import { CalendlyNoAccessError, deleteWebhook, validateCalendlyToken } from "@/lib/calendly/client";
import { decrypt, encrypt } from "@/lib/crypto";
import { calendlyAccountConnected, inngest } from "@/lib/inngest/client";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { createClient } from "@/lib/supabase/server";
import { requireOwner, requirePermission } from "@/lib/team/context";

// Calendly connection handles the client's Personal Access Token (a secret) and
// registers a webhook — owner-only, never delegable, same boundary as iClosed.

const tokenSchema = z.string().trim().min(20, "Colle ton jeton d'accès Calendly complet.");

export async function connectCalendly(formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const access = await requireOwner(userId);
  if (!access) {
    return { error: "Seul le propriétaire du compte peut connecter Calendly." };
  }

  const subscribed = await hasActiveSubscription(access.accountId);
  if (!subscribed) {
    return { error: "Le tracking des appels nécessite un abonnement actif. Active ton abonnement puis réessaie." };
  }

  const parsed = tokenSchema.safeParse(formData.get("token"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Jeton invalide" };
  }

  const check = await validateCalendlyToken(parsed.data);
  if (check.status === "invalid") {
    return { error: "Ce jeton Calendly ne fonctionne pas. Régénère-le dans Calendly (Integrations → API & Webhooks) et réessaie." };
  }
  if (check.status === "no_access") {
    return { error: "Ton plan Calendly ne donne pas accès à l'API. Un plan payant Calendly est requis, puis réessaie." };
  }
  if (check.status === "unknown") {
    return { error: "Impossible de vérifier ton jeton pour l'instant (souci réseau côté Calendly). Réessaie dans un instant." };
  }

  const values = {
    userId: access.accountId,
    accessTokenEncrypted: encrypt(parsed.data),
    organizationUri: check.orgUri,
    userUri: check.userUri,
    webhookToken: randomBytes(24).toString("hex"),
    webhookId: null,
    webhookSigningKeyEncrypted: null,
    initialSyncStatus: "pending" as const,
  };

  await Promise.all([
    db
      .insert(calendlyConnections)
      .values(values)
      .onConflictDoUpdate({
        target: calendlyConnections.userId,
        set: { ...values, connectedAt: new Date(), initialSyncCompletedAt: null },
      }),
    db.update(users).set({ calendlyConnected: true }).where(eq(users.id, access.accountId)),
  ]);

  try {
    await inngest.send(calendlyAccountConnected.create({ userId: access.accountId }));
  } catch (error) {
    console.error("inngest.send(calendlyAccountConnected) failed, Calendly connection saved anyway", error);
  }

  revalidatePath("/integrations");
  revalidatePath("/ventes/appels");
  revalidateBusinessData();
  return { error: null };
}

export async function disconnectCalendly(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const access = await requireOwner(userId);
  if (!access) {
    return { error: "Seul le propriétaire du compte peut déconnecter Calendly." };
  }

  const [connection] = await db
    .select()
    .from(calendlyConnections)
    .where(eq(calendlyConnections.userId, access.accountId))
    .limit(1);

  // Best-effort webhook teardown — must not block clearing local state.
  if (connection?.webhookId) {
    try {
      await deleteWebhook(decrypt(connection.accessTokenEncrypted), connection.webhookId);
    } catch (error) {
      console.error("Calendly webhook delete failed, clearing local connection anyway", error);
    }
  }

  await db.delete(calendlyConnections).where(eq(calendlyConnections.userId, access.accountId));
  await db.update(users).set({ calendlyConnected: false }).where(eq(users.id, access.accountId));

  revalidatePath("/integrations");
  revalidatePath("/ventes/appels");
  revalidateBusinessData();
  return { error: null };
}

// On-demand pull (idempotent) — same role as refreshIclosedCalls. Available to
// the owner and team members with the ventes:appels permission.
export async function refreshCalendlyCalls(): Promise<{ error: string | null; imported?: number }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const access = await requirePermission(userId, "ventes:appels");
  if (!access) {
    return { error: "Tu n'as pas accès à cette section." };
  }
  const { accountId } = access;

  const [connection] = await db
    .select()
    .from(calendlyConnections)
    .where(eq(calendlyConnections.userId, accountId))
    .limit(1);
  if (!connection || !connection.userUri) {
    return { error: "Calendly n'est pas connecté." };
  }

  const token = decrypt(connection.accessTokenEncrypted);
  try {
    const imported = await backfillCalendlyCalls(accountId, token, connection.userUri);
    await db
      .update(calendlyConnections)
      .set({ initialSyncStatus: "completed", initialSyncCompletedAt: new Date() })
      .where(eq(calendlyConnections.userId, accountId));
    revalidatePath("/ventes/appels");
    revalidatePath("/ventes/suivi");
    revalidateBusinessData();
    return { error: null, imported };
  } catch (error) {
    const noAccess = error instanceof CalendlyNoAccessError;
    await db
      .update(calendlyConnections)
      .set({ initialSyncStatus: noAccess ? "no_api_access" : "failed", initialSyncCompletedAt: new Date() })
      .where(eq(calendlyConnections.userId, accountId));
    revalidatePath("/ventes/appels");
    return {
      error: noAccess
        ? "Accès API Calendly non actif (plan Calendly payant requis)."
        : "La synchronisation a échoué. Réessaie dans un instant.",
    };
  }
}
