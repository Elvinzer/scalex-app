import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import type { ClosingTotals } from "@/lib/closing/metrics";
import { inRange } from "@/lib/dashboard/metrics";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { resolveMonthClosingTotals, resolveMonthSettingTotals } from "@/lib/monthly-metrics/resolve";
import type { FunnelTotals } from "@/lib/setting/funnel";

import type { MonthWindow } from "./completed-months";

type SettingEntry = typeof settingKpiEntries.$inferSelect;
type ClosingEntry = typeof closingKpiEntries.$inferSelect;

function sumFunnelTotals(totals: FunnelTotals[]): FunnelTotals {
  return totals.reduce(
    (sum, t) => ({
      newSubscribers: sum.newSubscribers + t.newSubscribers,
      firstMessagesSent: sum.firstMessagesSent + t.firstMessagesSent,
      conversationsStarted: sum.conversationsStarted + t.conversationsStarted,
      callsProposed: sum.callsProposed + t.callsProposed,
      callsBooked: sum.callsBooked + t.callsBooked,
    }),
    { newSubscribers: 0, firstMessagesSent: 0, conversationsStarted: 0, callsProposed: 0, callsBooked: 0 }
  );
}

function sumClosingTotals(totals: ClosingTotals[]): ClosingTotals {
  return totals.reduce(
    (sum, t) => ({ callsAttended: sum.callsAttended + t.callsAttended, salesClosed: sum.salesClosed + t.salesClosed }),
    { callsAttended: 0, salesClosed: 0 }
  );
}

// Sums resolveMonthSettingTotals/resolveMonthClosingTotals (monthly_metrics
// takes priority over daily entries per month, same rule as Datas/Funnel)
// across every month in `months`, plus whether any monthly_metrics row
// exists at all in the window (drives the "remplis au moins un mois" empty
// state — daily-entry-only periods don't count as "diagnostic-ready" since
// the spec's prerequisite is specifically about /datas).
export function aggregatePeriodTotals({
  months,
  allMonthlyRows,
  allSettingEntries,
  allClosingEntries,
}: {
  months: MonthWindow[];
  allMonthlyRows: MonthlyMetricsRow[];
  allSettingEntries: SettingEntry[];
  allClosingEntries: ClosingEntry[];
}): {
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  cashContractedTotal: number;
  hasAnyMonthlyRow: boolean;
} {
  const perMonthSetting: FunnelTotals[] = [];
  const perMonthClosing: ClosingTotals[] = [];
  let cashContractedTotal = 0;
  let hasAnyMonthlyRow = false;

  for (const { year, month, range } of months) {
    const monthlyRow = allMonthlyRows.find((row) => row.year === year && row.month === month) ?? null;
    if (monthlyRow) {
      hasAnyMonthlyRow = true;
      cashContractedTotal += monthlyRow.cashContracted ?? 0;
    }

    const dailySetting = allSettingEntries.filter((entry) => inRange(entry.date, range));
    const dailyClosing = allClosingEntries.filter((entry) => inRange(entry.date, range));

    perMonthSetting.push(resolveMonthSettingTotals(monthlyRow, dailySetting));
    perMonthClosing.push(resolveMonthClosingTotals(monthlyRow, dailyClosing));
  }

  return {
    settingTotals: sumFunnelTotals(perMonthSetting),
    closingTotals: sumClosingTotals(perMonthClosing),
    cashContractedTotal,
    hasAnyMonthlyRow,
  };
}
