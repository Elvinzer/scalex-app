import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  referralAttributions,
  referralCodes,
  referralCommissions,
  referralProgramSettings,
} from "@/db/schema";

import { calculateCommission, DEFAULT_REFERRAL_SETTINGS_ID } from "./schema";

export type PaidReferralInvoice = {
  invoiceId: string;
  stripeSubscriptionId: string;
  referredAccountId: string;
  currency: string;
  grossAmountCents: number;
  eligibleAmountCents: number;
  periodStart: Date | null;
  periodEnd: Date | null;
};

export type ReferralCommissionResult = "created" | "skipped" | "duplicate";

export async function recordPaidReferralInvoice(input: PaidReferralInvoice): Promise<ReferralCommissionResult> {
  const [attribution] = await db
    .select({
      id: referralAttributions.id,
      referrerAccountId: referralAttributions.referrerAccountId,
      codeRateBps: referralCodes.commissionRateBps,
      codeActive: referralCodes.isActive,
      programEnabled: referralProgramSettings.isEnabled,
      defaultRateBps: referralProgramSettings.defaultCommissionRateBps,
    })
    .from(referralAttributions)
    .innerJoin(referralCodes, eq(referralAttributions.referralCodeId, referralCodes.id))
    .leftJoin(
      referralProgramSettings,
      eq(referralProgramSettings.id, DEFAULT_REFERRAL_SETTINGS_ID)
    )
    .where(eq(referralAttributions.referredAccountId, input.referredAccountId))
    .limit(1);

  if (!attribution || !attribution.codeActive || !attribution.programEnabled) return "skipped";

  const commissionRateBps = attribution.codeRateBps ?? attribution.defaultRateBps ?? 0;
  const commissionAmountCents = calculateCommission(input.eligibleAmountCents, commissionRateBps);
  if (commissionAmountCents <= 0) return "skipped";

  const [inserted] = await db
    .insert(referralCommissions)
    .values({
      attributionId: attribution.id,
      referrerAccountId: attribution.referrerAccountId,
      referredAccountId: input.referredAccountId,
      stripeInvoiceId: input.invoiceId,
      stripeSubscriptionId: input.stripeSubscriptionId,
      currency: input.currency.toLowerCase(),
      grossAmountCents: input.grossAmountCents,
      eligibleAmountCents: input.eligibleAmountCents,
      commissionRateBps,
      commissionAmountCents,
      status: "available",
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    })
    .onConflictDoNothing({ target: referralCommissions.stripeInvoiceId })
    .returning({ id: referralCommissions.id });

  return inserted ? "created" : "duplicate";
}

export async function reverseAvailableReferralCommission(invoiceId: string): Promise<void> {
  await db
    .update(referralCommissions)
    .set({ status: "reversed", updatedAt: new Date() })
    .where(and(eq(referralCommissions.stripeInvoiceId, invoiceId), eq(referralCommissions.status, "available")));
}
