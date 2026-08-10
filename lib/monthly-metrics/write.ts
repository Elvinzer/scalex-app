import { db } from "@/db";
import { monthlyMetrics } from "@/db/schema";

import type { MonthlyMetricsInput } from "./types";

export type MonthlyMetricsWriteOptions = {
  settingManualOverride?: boolean;
  closingManualOverride?: boolean;
};

// The single upsert path for monthly_metrics — used by the manual "Mes
// chiffres" form (datas/actions.ts's saveMonthlyMetrics) AND the smart
// import commit (datas/import-actions.ts's commitImport), so the two never
// drift into two different write behaviors for the same table.
export async function writeMonthlyMetrics(
  accountId: string,
  year: number,
  month: number,
  values: MonthlyMetricsInput,
  options: MonthlyMetricsWriteOptions = {}
): Promise<void> {
  const sourceOverrides = {
    ...(options.settingManualOverride === undefined ? {} : { settingManualOverride: options.settingManualOverride }),
    ...(options.closingManualOverride === undefined ? {} : { closingManualOverride: options.closingManualOverride }),
  };

  await db
    .insert(monthlyMetrics)
    .values({ userId: accountId, year, month, ...values, ...sourceOverrides })
    .onConflictDoUpdate({
      target: [monthlyMetrics.userId, monthlyMetrics.year, monthlyMetrics.month],
      set: { ...values, ...sourceOverrides, updatedAt: new Date() },
    });
}
