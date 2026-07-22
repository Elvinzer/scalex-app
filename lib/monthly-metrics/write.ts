import { db } from "@/db";
import { monthlyMetrics } from "@/db/schema";

import type { MonthlyMetricsInput } from "./types";

// The single upsert path for monthly_metrics — used by the manual "Mes
// chiffres" form (datas/actions.ts's saveMonthlyMetrics) AND the smart
// import commit (datas/import-actions.ts's commitImport), so the two never
// drift into two different write behaviors for the same table.
export async function writeMonthlyMetrics(
  accountId: string,
  year: number,
  month: number,
  values: MonthlyMetricsInput
): Promise<void> {
  await db
    .insert(monthlyMetrics)
    .values({ userId: accountId, year, month, ...values })
    .onConflictDoUpdate({
      target: [monthlyMetrics.userId, monthlyMetrics.year, monthlyMetrics.month],
      set: { ...values, updatedAt: new Date() },
    });
}
