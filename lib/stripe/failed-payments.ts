import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { sales } from "@/db/schema";

import type { ReadOnlyStripeClient } from "./read-only-client";

const DECLINE_REASON_LABELS: Record<string, string> = {
  card_declined: "Carte refusée",
  insufficient_funds: "Fonds insuffisants",
  expired_card: "Carte expirée",
  incorrect_cvc: "CVC incorrect",
  processing_error: "Erreur de traitement",
  fraudulent: "Paiement bloqué (suspicion de fraude)",
};

function declineReasonLabel(charge: Stripe.Charge): string {
  const code = charge.outcome?.reason ?? charge.failure_code ?? null;
  if (code && DECLINE_REASON_LABELS[code]) return DECLINE_REASON_LABELS[code];
  return charge.failure_message ?? "Paiement refusé";
}

function lookbackUnixSeconds(monthsBack: number): number {
  return Math.floor(Date.now() / 1000) - monthsBack * 31 * 24 * 60 * 60;
}

// Best-effort link between a failed Stripe charge and a manually-entered
// sale: Stripe has no knowledge of our installment schedules, so a charge is
// matched to the closest not-yet-paid installment of a "stripe" sale for the
// same client email + exact amount. Unmatched charges (no sale on file with
// that email/amount, or the sale was tagged "virement") are skipped rather
// than spawning a phantom sale row — read-only by design, see
// lib/stripe/read-only-client.ts.
export async function syncFailedStripeCharges(
  accountId: string,
  stripe: ReadOnlyStripeClient,
  monthsBack = 12
): Promise<{ matched: number }> {
  const since = lookbackUnixSeconds(monthsBack);

  const failedCharges: Stripe.Charge[] = [];
  for await (const charge of stripe.charges.list({ created: { gte: since }, limit: 100 })) {
    if (charge.status !== "failed") continue;
    failedCharges.push(charge);
  }
  if (failedCharges.length === 0) return { matched: 0 };

  const candidates = await db
    .select()
    .from(sales)
    .where(and(eq(sales.userId, accountId), eq(sales.paymentMethod, "stripe")));

  let matched = 0;

  for (const charge of failedCharges) {
    const email = charge.billing_details?.email?.toLowerCase().trim() ?? null;
    if (!email) continue;

    const amountEur = Math.round(charge.amount / 100);

    for (const sale of candidates) {
      if (!sale.installments || sale.clientEmail?.toLowerCase().trim() !== email) continue;
      // Idempotent re-sync — this exact charge was already recorded on a
      // previous run.
      if (sale.installments.some((installment) => installment.stripeChargeId === charge.id)) continue;

      const index = sale.installments.findIndex(
        (installment) => installment.status !== "paid" && installment.amount === amountEur
      );
      if (index === -1) continue;

      const installments = [...sale.installments];
      installments[index] = {
        ...installments[index],
        status: "failed",
        stripeChargeId: charge.id,
        failureReason: declineReasonLabel(charge),
      };

      await db.update(sales).set({ installments }).where(eq(sales.id, sale.id));
      // Keep the in-memory candidate fresh so a second failed charge for the
      // same sale (a different installment) doesn't match against stale data.
      sale.installments = installments;
      matched += 1;
      break;
    }
  }

  return { matched };
}
