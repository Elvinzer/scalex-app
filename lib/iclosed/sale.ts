import type { SaleInput } from "@/lib/sales/schema";
import { generateSchedule } from "@/lib/sales/installments";
import type { SaleInstallment } from "@/lib/sales/types";

type CallPaymentType = "one_shot" | "installments";

// Builds the SaleInput for a call marked "closed" — the single place that turns
// (contracted, collected) into the existing sale/installment model, shared by
// the manual outcome dialog (setCallOutcome) and the iClosed backfill so both
// stay consistent. Money lives only on the resulting sale ("no double entry").
export function buildSaleInput(params: {
  inviteeName: string | null;
  inviteeEmail: string | null;
  closer: string | null;
  setterId: string | null;
  contracted: number;
  collected: number;
  saleDate: string; // "YYYY-MM-DD"
  paymentType?: CallPaymentType;
  installmentCount?: number;
}): SaleInput {
  const contracted = Math.max(0, Math.round(params.contracted));
  const collected = Math.min(contracted, Math.max(0, Math.round(params.collected)));

  // A call only exposes aggregate contracted/collected amounts. When the
  // closer explicitly chooses an installment plan, keep that count in the
  // sale JSON instead of collapsing every partial payment into two rows.
  // Partial collections keep the amount already received as the first paid
  // installment and split the remaining balance across the remaining rows.
  const requestedCount = Number.isInteger(params.installmentCount) ? Math.max(2, Math.min(12, params.installmentCount ?? 2)) : 2;
  const shouldUseInstallments = params.paymentType === "installments" || collected < contracted;
  const paymentType: SaleInput["paymentType"] = shouldUseInstallments ? "installments" : "one_shot";
  let installments: SaleInstallment[] | null = null;

  if (shouldUseInstallments) {
    if (collected <= 0) {
      installments = generateSchedule(contracted, requestedCount, params.saleDate);
    } else if (collected >= contracted) {
      installments = generateSchedule(contracted, requestedCount, params.saleDate).map((installment) => ({
        ...installment,
        status: "paid",
        paidAt: params.saleDate,
      }));
    } else {
      installments = [
        {
          amount: collected,
          dueDate: params.saleDate,
          status: "paid",
          paidAt: params.saleDate,
          stripeChargeId: null,
          failureReason: null,
          acknowledgedAt: null,
        },
        ...generateSchedule(contracted - collected, requestedCount - 1, params.saleDate),
      ];
    }
  }

  return {
    clientName: params.inviteeName?.trim() || "Client iClosed",
    clientEmail: params.inviteeEmail ?? null,
    sourceChannel: "iclosed",
    offerId: null,
    totalPrice: contracted,
    paymentType,
    // iClosed reports contracted/collected totals, not how the money moved
    // — never auto-tagged "stripe" (that would make lib/stripe/failed-payments.ts
    // eligible to match an unrelated charge onto it by email/amount alone).
    paymentMethod: "virement",
    installments,
    saleDate: params.saleDate,
    closer: params.closer ?? null,
    hasUpsell: false,
    upsellOfferId: null,
    upsellAmount: null,
    setterId: params.setterId,
    leadId: null,
  };
}
