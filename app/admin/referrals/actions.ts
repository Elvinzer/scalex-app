"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { referralCommissions, referralCodes, referralProgramSettings, referralPayouts } from "@/db/schema";
import { requireAdmin } from "@/lib/admin";
import {
  DEFAULT_REFERRAL_SETTINGS_ID,
  referralOverrideInputSchema,
  referralPayoutInputSchema,
  referralSettingsInputSchema,
} from "@/lib/referrals/schema";

export async function saveReferralSettings(data: unknown): Promise<{ error: string | null }> {
  await requireAdmin();
  const parsed = referralSettingsInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Réglages invalides" };

  await db
    .insert(referralProgramSettings)
    .values({ id: DEFAULT_REFERRAL_SETTINGS_ID, ...parsed.data, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: referralProgramSettings.id,
      set: { ...parsed.data, updatedAt: new Date() },
    });

  revalidatePath("/admin/referrals");
  revalidatePath("/parrainage");
  return { error: null };
}

export async function saveReferralCodeOverride(data: unknown): Promise<{ error: string | null }> {
  await requireAdmin();
  const parsed = referralOverrideInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Override invalide" };

  const [code] = await db
    .select({ id: referralCodes.id })
    .from(referralCodes)
    .where(eq(referralCodes.id, parsed.data.codeId))
    .limit(1);
  if (!code) return { error: "Code de parrainage introuvable." };

  await db
    .update(referralCodes)
    .set({ commissionRateBps: parsed.data.commissionRateBps, updatedAt: new Date() })
    .where(eq(referralCodes.id, parsed.data.codeId));

  revalidatePath("/admin/referrals");
  revalidatePath("/parrainage");
  return { error: null };
}

export async function markReferralPayoutPaid(data: unknown): Promise<{ error: string | null }> {
  await requireAdmin();
  const parsed = referralPayoutInputSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Paiement invalide" };

  const result = await db.transaction(async (tx) => {
    const available = await tx
      .select({
        id: referralCommissions.id,
        currency: referralCommissions.currency,
        amountCents: referralCommissions.commissionAmountCents,
        createdAt: referralCommissions.createdAt,
      })
      .from(referralCommissions)
      .where(
        and(
          eq(referralCommissions.referrerAccountId, parsed.data.referrerAccountId),
          eq(referralCommissions.status, "available"),
          eq(referralCommissions.currency, parsed.data.currency)
        )
      );

    if (available.length === 0) return { error: "Aucune commission disponible pour ce compte." };

    const byCurrency = new Map<string, typeof available>();
    for (const commission of available) {
      const current = byCurrency.get(commission.currency) ?? [];
      current.push(commission);
      byCurrency.set(commission.currency, current);
    }

    for (const [currency, commissions] of byCurrency) {
      const [payout] = await tx
        .insert(referralPayouts)
        .values({
          referrerAccountId: parsed.data.referrerAccountId,
          currency,
          amountCents: commissions.reduce((sum, commission) => sum + commission.amountCents, 0),
          periodStart: commissions.reduce<Date | null>(
            (earliest, commission) => (!earliest || commission.createdAt < earliest ? commission.createdAt : earliest),
            null
          ),
          periodEnd: commissions.reduce<Date | null>(
            (latest, commission) => (!latest || commission.createdAt > latest ? commission.createdAt : latest),
            null
          ),
          externalReference: parsed.data.externalReference,
          note: parsed.data.note,
        })
        .returning({ id: referralPayouts.id });

      if (!payout) throw new Error("Le paiement n'a pas pu être enregistré.");

      await tx
        .update(referralCommissions)
        .set({ status: "paid", payoutId: payout.id, updatedAt: new Date() })
        .where(inArray(referralCommissions.id, commissions.map((commission) => commission.id)));
    }

    return { error: null };
  });

  revalidatePath("/admin/referrals");
  revalidatePath("/parrainage");
  return result;
}
