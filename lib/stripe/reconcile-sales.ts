import type { PaymentMethod, PaymentType, SaleInstallment } from "@/lib/sales/types";

export type StripeChargeForReconciliation = {
  id: string;
  status: "succeeded" | "failed";
  amountEur: number;
  createdAt: string;
  email: string | null;
  clientName: string | null;
  customerId: string | null;
  isSubscription: boolean;
  isRefunded: boolean;
  failureReason: string | null;
  /** Resolved only from an explicit identifier already present in Stripe metadata. */
  metaTouchpointId?: string | null;
};

export type ReconciliationSale = {
  id: string;
  clientEmail: string | null;
  totalPrice: number;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  installments: SaleInstallment[] | null;
  stripeCustomerId: string | null;
  metaTouchpointId: string | null;
  isOrphan: boolean;
};

export type StripeChargeMatch =
  | { kind: "already_recorded"; saleId: string; installmentIndex: number }
  | { kind: "matched"; saleId: string; installmentIndex: number | null }
  | { kind: "subscription"; saleId: string }
  | { kind: "ambiguous"; saleIds: string[] }
  | { kind: "orphan"; reason: "no_match" | "missing_customer" }
  | { kind: "skip_failed" };

function normalizeEmail(email: string | null): string | null {
  const normalized = email?.trim().toLowerCase() ?? "";
  return normalized.length > 0 ? normalized : null;
}

function eligibleInstallmentIndices(sale: ReconciliationSale, amountEur: number): number[] {
  return (sale.installments ?? []).flatMap((installment, index) =>
    installment.amount === amountEur && installment.status !== "paid" && installment.status !== "refunded" ? [index] : []
  );
}

function findRecordedCharge(sales: ReconciliationSale[], chargeId: string): { saleId: string; installmentIndex: number } | null {
  for (const sale of sales) {
    const installmentIndex = sale.installments?.findIndex((installment) => installment.stripeChargeId === chargeId) ?? -1;
    if (installmentIndex >= 0) return { saleId: sale.id, installmentIndex };
  }
  return null;
}

/**
 * Pure matching policy for one Connect charge. It deliberately returns an
 * ambiguous result instead of guessing whenever more than one deal or
 * installment could receive the payment.
 */
export function matchStripeCharge(charge: StripeChargeForReconciliation, sales: ReconciliationSale[]): StripeChargeMatch {
  const recorded = findRecordedCharge(sales, charge.id);
  if (recorded) return { kind: "already_recorded", ...recorded };

  const subscriptionCandidates = charge.customerId
    ? sales.filter(
        (sale) =>
          sale.paymentMethod === "stripe" && sale.paymentType === "subscription" && sale.stripeCustomerId === charge.customerId
      )
    : [];

  if (subscriptionCandidates.length > 1) {
    return { kind: "ambiguous", saleIds: subscriptionCandidates.map((sale) => sale.id) };
  }
  if (subscriptionCandidates.length === 1) {
    return { kind: "subscription", saleId: subscriptionCandidates[0].id };
  }
  if (charge.isSubscription) {
    return charge.customerId ? { kind: "orphan", reason: "no_match" } : { kind: "orphan", reason: "missing_customer" };
  }

  const email = normalizeEmail(charge.email);
  const candidates: Array<{ saleId: string; installmentIndex: number | null }> = [];

  if (email) {
    for (const sale of sales) {
      if (sale.isOrphan || sale.paymentMethod !== "stripe" || normalizeEmail(sale.clientEmail) !== email) continue;

      if (sale.paymentType === "one_shot" && sale.installments === null && sale.totalPrice === charge.amountEur) {
        candidates.push({ saleId: sale.id, installmentIndex: null });
        continue;
      }

      for (const installmentIndex of eligibleInstallmentIndices(sale, charge.amountEur)) {
        candidates.push({ saleId: sale.id, installmentIndex });
      }
    }
  }

  if (candidates.length === 1) return { kind: "matched", ...candidates[0] };
  if (candidates.length > 1) {
    return { kind: "ambiguous", saleIds: [...new Set(candidates.map((candidate) => candidate.saleId))] };
  }
  return charge.status === "failed"
    ? { kind: "skip_failed" }
    : { kind: "orphan", reason: email ? "no_match" : "missing_customer" };
}

export function buildStripeInstallment(charge: StripeChargeForReconciliation): SaleInstallment {
  return {
    amount: charge.amountEur,
    dueDate: charge.createdAt,
    status: charge.isRefunded ? "refunded" : charge.status === "failed" ? "failed" : "paid",
    paidAt: charge.status === "succeeded" ? charge.createdAt : null,
    stripeChargeId: charge.id,
    failureReason: charge.status === "failed" ? charge.failureReason : null,
    acknowledgedAt: null,
  };
}

export function applyStripeChargeToSale(
  sale: ReconciliationSale,
  charge: StripeChargeForReconciliation,
  installmentIndex: number | null
): ReconciliationSale {
  const installment = buildStripeInstallment(charge);
  const installments = sale.installments ? [...sale.installments] : [];

  if (installmentIndex === null) {
    installments.push(installment);
  } else {
    installments[installmentIndex] = {
      ...installments[installmentIndex],
      ...installment,
    };
  }

  return {
    ...sale,
    installments,
    // Never replace an attribution already attached to the local sale. A
    // second explicit identifier is not enough evidence to rewrite it.
    metaTouchpointId: sale.metaTouchpointId ?? charge.metaTouchpointId ?? null,
  };
}

export function appendStripeSubscriptionCharge(
  sale: ReconciliationSale,
  charge: StripeChargeForReconciliation
): ReconciliationSale {
  return applyStripeChargeToSale(sale, charge, null);
}
