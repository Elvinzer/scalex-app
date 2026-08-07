import type { InstallmentSummary, OverallSaleStatus, SaleInstallment } from "./types";

export type DisplayInstallment = {
  installment: SaleInstallment;
  index: number;
  synthetic: boolean;
};

// Equal split, remainder absorbed by the last installment so the sum always
// matches totalPrice exactly. Dates are spaced 1 month apart starting from
// startDate — still fully editable per-row in the form after generation.
export function generateSchedule(
  totalPrice: number,
  count: number,
  startDate: string
): SaleInstallment[] {
  const base = Math.floor(totalPrice / count);
  const remainder = totalPrice - base * count;
  const start = new Date(`${startDate}T00:00:00Z`);

  return Array.from({ length: count }, (_, index) => {
    const due = new Date(start);
    due.setUTCMonth(due.getUTCMonth() + index);
    const amount = index === count - 1 ? base + remainder : base;

    return {
      amount,
      dueDate: due.toISOString().slice(0, 10),
      status: "upcoming" as const,
      paidAt: null,
      stripeChargeId: null,
      failureReason: null,
      acknowledgedAt: null,
    };
  });
}

function overallStatus(installments: SaleInstallment[]): OverallSaleStatus {
  if (installments.some((i) => i.status === "failed")) return "failed";
  if (installments.some((i) => i.status === "refunded") && installments.every((i) => i.status === "paid" || i.status === "refunded")) {
    return "refunded";
  }
  if (installments.every((i) => i.status === "paid")) return "paid_full";
  return "in_progress";
}

// For a one-shot sale (installments === null), the full totalPrice counts as
// already collected — there's no schedule to track.
export function summarize(
  totalPrice: number,
  installments: SaleInstallment[] | null
): InstallmentSummary {
  if (!installments || installments.length === 0) {
    return { paidTotal: totalPrice, pendingTotal: 0, failedTotal: 0, refundedTotal: 0, nextDue: null, overallStatus: "paid_full" };
  }

  const paidTotal = installments.filter((i) => i.status === "paid").reduce((sum, i) => sum + i.amount, 0);
  const pendingTotal = installments.filter((i) => i.status === "upcoming").reduce((sum, i) => sum + i.amount, 0);
  const failedTotal = installments.filter((i) => i.status === "failed").reduce((sum, i) => sum + i.amount, 0);
  const refundedTotal = installments.filter((i) => i.status === "refunded").reduce((sum, i) => sum + i.amount, 0);
  const nextDue =
    installments
      .filter((i) => i.status === "upcoming")
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate ?? null;

  return { paidTotal, pendingTotal, failedTotal, refundedTotal, nextDue, overallStatus: overallStatus(installments) };
}

// One-shot sales historically store installments as null. The sale is still
// one payment, so the table/drawer use a synthetic read-only row for it while
// keeping the persisted deal shape unchanged.
export function displayInstallments(
  totalPrice: number,
  saleDate: string,
  installments: SaleInstallment[] | null
): DisplayInstallment[] {
  if (installments && installments.length > 0) {
    return installments.map((installment, index) => ({ installment, index, synthetic: false }));
  }

  return [
    {
      installment: {
        amount: totalPrice,
        dueDate: saleDate,
        status: "paid",
        paidAt: saleDate,
        stripeChargeId: null,
        failureReason: null,
        acknowledgedAt: null,
      },
      index: 0,
      synthetic: true,
    },
  ];
}
