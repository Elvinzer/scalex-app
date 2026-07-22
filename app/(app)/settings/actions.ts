"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import {
  adCampaigns,
  businessLevers,
  businessProfile,
  closingKpiEntries,
  closingVideos,
  contentPosts,
  dataImports,
  diagnostics,
  funnelStageInsights,
  improvementEvents,
  journalNotes,
  monthlyMetrics,
  projects,
  sales,
  scaleScoreHistory,
  settingKpiEntries,
  sharedAgentUsage,
  stripeConnections,
  subscriptions,
  teamMembers,
  teamRoles,
  todos,
  users,
} from "@/db/schema";
import { validateAnthropicKey } from "@/lib/agent/validate-key";
import { encrypt } from "@/lib/crypto";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";
import { requireEnv } from "@/lib/utils";

const apiKeySchema = z
  .string()
  .trim()
  .regex(/^sk-ant-/, "La clé doit commencer par sk-ant-");

export async function saveAnthropicKey(
  formData: FormData
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }

  const parsed = apiKeySchema.safeParse(formData.get("apiKey"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Clé invalide" };
  }

  const validation = await validateAnthropicKey(parsed.data);
  if (validation === "invalid") {
    return {
      error:
        "Cette clé ne fonctionne pas. Vérifie que tu l'as bien copiée depuis console.anthropic.com et réessaie.",
    };
  }
  if (validation === "unknown") {
    return {
      error:
        "Impossible de vérifier ta clé pour l'instant (souci réseau côté Anthropic). Réessaie dans quelques instants.",
    };
  }

  await db
    .update(users)
    .set({ anthropicApiKeyEncrypted: encrypt(parsed.data), anthropicApiKeyInvalid: false })
    .where(eq(users.id, data.claims.sub as string));

  revalidatePath("/settings");
  return { error: null };
}

const profileSchema = z.object({
  displayName: z.string().trim().max(40, "40 caractères maximum").optional(),
  // Uploaded client-side to Supabase Storage before this action runs (see
  // profile-form.tsx) — this only ever receives the resulting public URL,
  // never raw image bytes.
  avatarUrl: z.string().trim().url().optional(),
});

export async function updateProfile(formData: FormData): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }

  const parsed = profileSchema.safeParse({
    displayName: formData.get("displayName") || undefined,
    avatarUrl: formData.get("avatarUrl") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Profil invalide" };
  }

  await db
    .update(users)
    .set({
      ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName || null } : {}),
      ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl } : {}),
    })
    .where(eq(users.id, data.claims.sub as string));

  revalidatePath("/settings");
  return { error: null };
}

// Personal preference — written via the logged-in userId, same as
// updateProfile above (never accountId): each team member controls their
// own animation comfort, independent of the OS-level prefers-reduced-motion
// (see components/falco/falco-context.tsx).
export async function updateFalcoPreferences(reduceFalcoAnimations: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }

  await db.update(users).set({ reduceFalcoAnimations }).where(eq(users.id, data.claims.sub as string));

  revalidatePath("/settings");
  return { error: null };
}

export async function disconnectStripe(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const access = await requireOwner(userId);
  if (!access) {
    return { error: "Seul le propriétaire du compte peut déconnecter Stripe." };
  }

  const [connection] = await db
    .select()
    .from(stripeConnections)
    .where(eq(stripeConnections.userId, access.accountId))
    .limit(1);

  // Best-effort revoke with Stripe — a failure here (e.g. already revoked on
  // Stripe's side) must not block clearing our own local state, since that's
  // what actually stops us from reading the client's Stripe data.
  if (connection) {
    try {
      await getPlatformStripeClient().oauth.deauthorize({
        client_id: requireEnv("STRIPE_CONNECT_CLIENT_ID"),
        stripe_user_id: connection.stripeAccountId,
      });
    } catch (error) {
      console.error("Stripe deauthorize failed, clearing local connection anyway", error);
    }
  }

  await db.delete(stripeConnections).where(eq(stripeConnections.userId, access.accountId));
  await db.update(users).set({ stripeConnectId: null }).where(eq(users.id, access.accountId));

  revalidatePath("/settings");
  return { error: null };
}

// Wipes every piece of business/diagnostic/journal/team data for this
// account and resets the users row to a fresh-signup state — but
// deliberately NEVER touches anthropicApiKeyEncrypted/Invalid,
// stripeConnectId/stripe_connections, or stripeCustomerId/subscriptions:
// the BYOK key, Stripe Connect link, and paid Scale X subscription are
// account-level infrastructure, not "business data", and a reset must not
// silently kill a subscription the user is still paying for. Contrast with
// deleteAccount below, which does wipe those (by design, via cascade).
export async function resetAccountData(): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const access = await requireOwner(userId);
  if (!access) {
    return { error: "Seul le propriétaire du compte peut réinitialiser les données." };
  }
  const { accountId } = access;

  await db.transaction(async (tx) => {
    await tx.delete(improvementEvents).where(eq(improvementEvents.userId, accountId));
    await tx.delete(journalNotes).where(eq(journalNotes.userId, accountId));
    await tx.delete(todos).where(eq(todos.userId, accountId));
    await tx.delete(projects).where(eq(projects.userId, accountId));
    await tx.delete(scaleScoreHistory).where(eq(scaleScoreHistory.userId, accountId));
    await tx.delete(adCampaigns).where(eq(adCampaigns.userId, accountId));
    await tx.delete(closingVideos).where(eq(closingVideos.userId, accountId));
    await tx.delete(sales).where(eq(sales.userId, accountId));
    await tx.delete(contentPosts).where(eq(contentPosts.userId, accountId));
    await tx.delete(businessLevers).where(eq(businessLevers.userId, accountId));
    await tx.delete(dataImports).where(eq(dataImports.userId, accountId));
    await tx.delete(monthlyMetrics).where(eq(monthlyMetrics.userId, accountId));
    await tx.delete(sharedAgentUsage).where(eq(sharedAgentUsage.userId, accountId));
    await tx.delete(funnelStageInsights).where(eq(funnelStageInsights.userId, accountId));
    await tx.delete(businessProfile).where(eq(businessProfile.userId, accountId));
    await tx.delete(closingKpiEntries).where(eq(closingKpiEntries.userId, accountId));
    await tx.delete(settingKpiEntries).where(eq(settingKpiEntries.userId, accountId));
    await tx.delete(diagnostics).where(eq(diagnostics.userId, accountId));
    // teamMemberRoles cascades automatically from teamMembers' own FK.
    await tx.delete(teamMembers).where(eq(teamMembers.accountId, accountId));
    await tx.delete(teamRoles).where(eq(teamRoles.accountId, accountId));

    await tx
      .update(users)
      .set({
        onboardingCompleted: false,
        businessProfileCompletedAt: null,
        sector: null,
        displayName: null,
        avatarUrl: null,
        lastImproveMetricKey: null,
        lastImproveMetricRateSnapshot: null,
        advancedModulesEnabled: false,
      })
      .where(eq(users.id, accountId));
  });

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  return { error: null };
}

// Irreversible. Best-effort cleanup of external state (Stripe subscription,
// Stripe Connect) so nothing keeps billing/connecting after the account is
// gone, then deletes the Supabase Auth user itself — every table in
// db/schema.ts cascades from users.id (which cascades from auth.users.id),
// so this one call is what actually purges subscriptions/stripe_connections
// and everything resetAccountData deliberately preserves. Unlike the
// best-effort Stripe steps, a failure on THIS step is returned as an error
// rather than swallowed — otherwise the user would believe their account
// and login are gone when they aren't.
export async function deleteAccount(confirmEmail: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const access = await requireOwner(userId);
  if (!access) {
    return { error: "Seul le propriétaire du compte peut supprimer le compte." };
  }
  const { accountId } = access;

  const [user] = await db.select().from(users).where(eq(users.id, accountId)).limit(1);
  if (!user || confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    return { error: "L'email saisi ne correspond pas à celui du compte." };
  }

  const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.userId, accountId)).limit(1);
  if (subscription?.stripeSubscriptionId) {
    try {
      await getPlatformStripeClient().subscriptions.cancel(subscription.stripeSubscriptionId);
    } catch (error) {
      console.error("Stripe subscription cancel failed, deleting account anyway", error);
    }
  }

  const [connection] = await db.select().from(stripeConnections).where(eq(stripeConnections.userId, accountId)).limit(1);
  if (connection) {
    try {
      await getPlatformStripeClient().oauth.deauthorize({
        client_id: requireEnv("STRIPE_CONNECT_CLIENT_ID"),
        stripe_user_id: connection.stripeAccountId,
      });
    } catch (error) {
      console.error("Stripe deauthorize failed, deleting account anyway", error);
    }
  }

  const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(accountId);
  if (error) {
    console.error("Supabase auth.admin.deleteUser failed", error);
    return { error: "La suppression a échoué. Réessaie, ou contacte le support si ça persiste." };
  }

  return { error: null };
}
