"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { z } from "zod";

import { db } from "@/db";
import {
  adCampaigns,
  businessLevers,
  businessProfile,
  businesses,
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
  stripeConnections,
  teamMembers,
  teamRoles,
  todos,
  users,
} from "@/db/schema";
import { validateAnthropicKey } from "@/lib/agent/validate-key";
import { encrypt } from "@/lib/crypto";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
import { revalidateBusinessData } from "@/lib/revalidate-data";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireOwner } from "@/lib/team/context";
import {
  isThemePreference,
  THEME_PREFERENCE_COOKIE,
  THEME_PREFERENCE_COOKIE_MAX_AGE,
  type ThemePreference,
} from "@/lib/theme/config";
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

  const access = await requireOwner(data.claims.sub as string);
  if (!access) return { error: "Action réservée au propriétaire du compte." };

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
    .update(businesses)
    .set({ anthropicApiKeyEncrypted: encrypt(parsed.data), anthropicApiKeyInvalid: false })
    .where(eq(businesses.id, access.accountId));

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

// Personal appearance preference — the database follows the user across
// devices while the cookie lets the next server render start in the chosen
// theme before the authenticated app tree hydrates.
export async function saveThemePreference(next: string): Promise<{ error: string | null }> {
  if (!isThemePreference(next)) {
    return { error: "Préférence de thème invalide." };
  }
  const preference: ThemePreference = next;

  const cookieStore = await cookies();
  cookieStore.set(THEME_PREFERENCE_COOKIE, preference, {
    maxAge: THEME_PREFERENCE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
  });

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub as string | undefined;
  if (!userId) {
    return { error: "Session expirée, reconnecte-toi." };
  }

  await db.update(users).set({ themePreference: preference }).where(eq(users.id, userId));

  revalidatePath("/", "layout");
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

  // Freeze, never erase: every month Stripe was still the source of truth
  // for keeps its last-known figure, just marked "stale" — datas/month-modal.tsx
  // shows the frozen-value banner and reopens manual entry; "stripe_stale" is
  // deliberately never a target of the import-block in
  // app/(app)/datas/import-actions.ts, unlike a live "stripe" source.
  await db
    .update(monthlyMetrics)
    .set({ cashCollectedSource: "stripe_stale" })
    .where(and(eq(monthlyMetrics.userId, access.accountId), eq(monthlyMetrics.cashCollectedSource, "stripe")));
  await db
    .update(monthlyMetrics)
    .set({ newCustomersSource: "stripe_stale" })
    .where(and(eq(monthlyMetrics.userId, access.accountId), eq(monthlyMetrics.newCustomersSource, "stripe")));

  await db.delete(stripeConnections).where(eq(stripeConnections.userId, access.accountId));
  await db.update(businesses).set({ stripeConnectId: null }).where(eq(businesses.id, access.accountId));

  revalidatePath("/settings");
  revalidatePath("/integrations");
  revalidatePath("/dashboard");
  revalidatePath("/datas");
  revalidatePath("/ventes/suivi");
  revalidateBusinessData(access.accountId);
  return { error: null };
}

// Reset the selected business while retaining its credentials and billing.
// Personal preferences and every other business remain independent.
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
    await tx.delete(funnelStageInsights).where(eq(funnelStageInsights.userId, accountId));
    await tx.delete(businessProfile).where(eq(businessProfile.userId, accountId));
    await tx.delete(closingKpiEntries).where(eq(closingKpiEntries.userId, accountId));
    await tx.delete(settingKpiEntries).where(eq(settingKpiEntries.userId, accountId));
    await tx.delete(diagnostics).where(eq(diagnostics.userId, accountId));
    // teamMemberRoles cascades automatically from teamMembers' own FK.
    await tx.delete(teamMembers).where(eq(teamMembers.accountId, accountId));
    await tx.delete(teamRoles).where(eq(teamRoles.accountId, accountId));

    await tx
      .update(businesses)
      .set({
        onboardingCompleted: false,
        businessProfileCompletedAt: null,
        sector: null,
        lastImproveMetricKey: null,
        lastImproveMetricRateSnapshot: null,
        advancedModulesEnabled: false,
      })
      .where(eq(businesses.id, accountId));
  });

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  revalidateBusinessData(accountId);
  return { error: null };
}

// A personal login cannot disappear while it owns a business. Check this
// before any external effect, independently of the currently selected business.
export async function deleteAccount(confirmEmail: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = data.claims.sub as string;

  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const confirmation = z.string().trim().email().safeParse(confirmEmail);
  if (!user || !confirmation.success || confirmation.data.toLowerCase() !== user.email.toLowerCase()) {
    return { error: "L'email saisi ne correspond pas à celui du compte." };
  }

  const [ownedBusiness] = await db.select({ id: businesses.id }).from(businesses).where(eq(businesses.ownerUserId, userId)).limit(1);
  if (ownedBusiness) {
    const t = await getTranslations("settings.page");
    return { error: t("deleteOwnedBusinessBlock") };
  }

  // Historical actor references are retained by the schema. Revoke sessions
  // before identity deletion so the browser cannot continue as the old user.
  await supabase.auth.signOut({ scope: "global" });
  const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(userId);
  if (error) {
    console.error("Supabase auth.admin.deleteUser failed", error);
    return { error: "La suppression a échoué. Réessaie, ou contacte le support si ça persiste." };
  }

  return { error: null };
}
