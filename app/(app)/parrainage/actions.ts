"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { referralCodes } from "@/db/schema";
import { requireUserIdOrError } from "@/lib/current-user";
import { referralCodeInputSchema } from "@/lib/referrals/schema";
import { requireOwner } from "@/lib/team/context";

export async function createReferralCode(data: unknown): Promise<{ error: string | null }> {
  const userId = await requireUserIdOrError();
  if (typeof userId !== "string") return userId;

  const access = await requireOwner(userId);
  if (!access) return { error: "Seul le propriétaire du compte peut gérer le parrainage." };

  const parsed = referralCodeInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Code invalide" };

  const [existingCode] = await db
    .select({ id: referralCodes.id })
    .from(referralCodes)
    .where(eq(referralCodes.code, parsed.data.code))
    .limit(1);
  if (existingCode) return { error: "Ce code est déjà utilisé." };

  const [existingAccountCode] = await db
    .select({ id: referralCodes.id })
    .from(referralCodes)
    .where(eq(referralCodes.accountId, access.accountId))
    .limit(1);
  if (existingAccountCode) return { error: "Ton compte possède déjà un code de parrainage." };

  try {
    await db.insert(referralCodes).values({ accountId: access.accountId, code: parsed.data.code });
  } catch {
    return { error: "Impossible de créer ce code. Essaie une autre valeur." };
  }

  revalidatePath("/parrainage");
  revalidatePath("/admin/referrals");
  return { error: null };
}
