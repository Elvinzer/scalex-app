export type InstallmentStatus = "upcoming" | "paid" | "failed" | "refunded";

export type SaleInstallment = {
  amount: number; // euros
  dueDate: string; // "YYYY-MM-DD"
  status: InstallmentStatus;
  paidAt: string | null; // "YYYY-MM-DD", set when status becomes "paid"
  // Set only by lib/stripe/failed-payments.ts when it matches a failed
  // Stripe charge to this installment — null for manually-marked failures
  // and for anything paid by "virement".
  stripeChargeId: string | null;
  failureReason: string | null; // French label, set alongside stripeChargeId
  // Set when the owner clicks "Marquer comme traité" on a failed
  // installment — an acknowledgement that they've followed up with the
  // client, NOT a status change. The installment stays "failed" until a
  // real payment (or a manual override) says otherwise.
  acknowledgedAt: string | null; // ISO datetime
};

export type PaymentType = "one_shot" | "installments" | "subscription";
export type PaymentMethod = "stripe" | "virement";

export type SaleRow = {
  id: string;
  clientName: string;
  clientEmail: string | null;
  sourceChannel: string | null;
  offerId: string | null;
  totalPrice: number;
  paymentType: PaymentType;
  paymentMethod: PaymentMethod;
  // Origin of the deal. Unlike sourceChannel (marketing attribution), this
  // records which system created the deal row.
  source: string;
  isOrphan: boolean;
  stripeCustomerId: string | null;
  installments: SaleInstallment[] | null;
  saleDate: string;
  closer: string | null;
  hasUpsell: boolean;
  upsellOfferId: string | null;
  upsellAmount: number | null; // euros
  // Pipeline tie-in — both nullable since most sales still come from the
  // plain manual /ventes/suivi form, not the Kanban.
  setterId: string | null;
  leadId: string | null;
  createdAt: string;
};

export type OverallSaleStatus = "paid_full" | "in_progress" | "failed" | "refunded";

export type InstallmentSummary = {
  paidTotal: number;
  pendingTotal: number;
  failedTotal: number;
  refundedTotal: number;
  nextDue: string | null;
  overallStatus: OverallSaleStatus;
};
