"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { stripeConnections, users } from "@/db/schema";
import { validateAnthropicKey } from "@/lib/agent/validate-key";
import { encrypt } from "@/lib/crypto";
import { getPlatformStripeClient } from "@/lib/stripe/platform-client";
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
