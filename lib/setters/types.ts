export type SetterRow = {
  id: string;
  name: string;
  email: string | null;
  defaultCommissionPct: number; // 0-1 fraction
  active: boolean;
  createdAt: string;
};

export type SetterSaleDetail = {
  saleId: string;
  clientName: string;
  offerId: string | null;
  offerName: string | null;
  saleDate: string;
  totalPrice: number;
  commissionPct: number;
  commissionAmount: number;
  paymentStatus: "payee" | "a_venir";
};

export type SetterCommissions = {
  validatedSalesCount: number;
  validatedRevenueEur: number;
  commissionPaidEur: number;
  commissionUpcomingEur: number;
  sales: SetterSaleDetail[];
};
