"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/db";
import { users } from "@/db/schema";
import { validateAnthropicKey } from "@/lib/agent/validate-key";
import { encrypt } from "@/lib/crypto";
import { createClient } from "@/lib/supabase/server";

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
        "Impossible de vérifier ta clé pour l'instant (souci réseau côté Anthropic) — réessaie dans quelques instants.",
    };
  }

  await db
    .update(users)
    .set({ anthropicApiKeyEncrypted: encrypt(parsed.data), anthropicApiKeyInvalid: false })
    .where(eq(users.id, data.claims.sub as string));

  revalidatePath("/settings");
  return { error: null };
}
