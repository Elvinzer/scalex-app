import type { SaleRow } from "./types";

export type UpcomingPaymentForecast = {
  offset: number;
  monthKey: string;
  amount: number;
  count: number;
};

export function buildUpcomingPaymentForecast(
  sales: SaleRow[],
  now = new Date(),
  months = 6,
): UpcomingPaymentForecast[] {
  const firstMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const buckets = Array.from({ length: months }, (_, index) => {
    const month = new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index, 1));
    return {
      offset: index + 1,
      monthKey: `${month.getUTCFullYear()}-${String(month.getUTCMonth() + 1).padStart(2, "0")}`,
      amount: 0,
      count: 0,
    };
  });
  const byMonth = new Map(buckets.map((bucket) => [bucket.monthKey, bucket]));

  for (const sale of sales) {
    if (sale.isOrphan || !sale.installments) continue;
    for (const installment of sale.installments) {
      if (installment.status !== "upcoming") continue;
      const bucket = byMonth.get(installment.dueDate.slice(0, 7));
      if (!bucket) continue;
      bucket.amount += installment.amount;
      bucket.count += 1;
    }
  }

  return buckets;
}
