export type InstallmentStatus = "upcoming" | "paid" | "failed";

export type SaleInstallment = {
  amount: number; // euros
  dueDate: string; // "YYYY-MM-DD"
  status: InstallmentStatus;
  paidAt: string | null; // "YYYY-MM-DD", set when status becomes "paid"
};

export type PaymentType = "one_shot" | "installments";

export type SaleRow = {
  id: string;
  clientName: string;
  clientEmail: string | null;
  sourceChannel: string | null;
  offerId: string | null;
  totalPrice: number;
  paymentType: PaymentType;
  installments: SaleInstallment[] | null;
  saleDate: string;
  closer: string | null;
  createdAt: string;
};

export type OverallSaleStatus = "paid_full" | "in_progress" | "failed";

export type InstallmentSummary = {
  paidTotal: number;
  pendingTotal: number;
  failedTotal: number;
  nextDue: string | null;
  overallStatus: OverallSaleStatus;
};
