import type { SaleInput } from "@/lib/sales/schema";
import type { SaleInstallment } from "@/lib/sales/types";

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
}): SaleInput {
  const contracted = Math.max(0, Math.round(params.contracted));
  const collected = Math.min(contracted, Math.max(0, Math.round(params.collected)));

  // Fully collected → one-shot; partial → a paid slice + an upcoming remainder
  // (summarize() then reports paidTotal = collected).
  let paymentType: SaleInput["paymentType"] = "one_shot";
  let installments: SaleInstallment[] | null = null;
  if (collected < contracted) {
    paymentType = "installments";
    installments = [
      { amount: collected, dueDate: params.saleDate, status: "paid", paidAt: params.saleDate },
      { amount: contracted - collected, dueDate: params.saleDate, status: "upcoming", paidAt: null },
    ];
  }

  return {
    clientName: params.inviteeName?.trim() || "Client iClosed",
    clientEmail: params.inviteeEmail ?? null,
    sourceChannel: "iclosed",
    offerId: null,
    totalPrice: contracted,
    paymentType,
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
