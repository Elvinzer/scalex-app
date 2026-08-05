import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import type { ClosingTotals } from "@/lib/closing/metrics";
import { inRange } from "@/lib/dashboard/metrics";
import { computeCompletion, monthStatus } from "@/lib/monthly-metrics/completion";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { resolveDailySourceOverlay, resolveMonthClosingTotals, resolveMonthSettingTotals } from "@/lib/monthly-metrics/resolve";
import { EMPTY_MONTHLY_METRICS } from "@/lib/monthly-metrics/types";
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
  emptyMonths: MonthWindow[];
} {
  const perMonthSetting: FunnelTotals[] = [];
  const perMonthClosing: ClosingTotals[] = [];
  let cashContractedTotal = 0;
  let hasAnyMonthlyRow = false;
  const emptyMonths: MonthWindow[] = [];

  for (const monthWindow of months) {
    const { year, month, range } = monthWindow;
    const monthlyRow = allMonthlyRows.find((row) => row.year === year && row.month === month) ?? null;
    if (monthlyRow) {
      hasAnyMonthlyRow = true;
      cashContractedTotal += monthlyRow.cashContracted ?? 0;
    }

    const dailySetting = allSettingEntries.filter((entry) => inRange(entry.date, range));
    const dailyClosing = allClosingEntries.filter((entry) => inRange(entry.date, range));

    perMonthSetting.push(resolveMonthSettingTotals(monthlyRow, dailySetting));
    perMonthClosing.push(resolveMonthClosingTotals(monthlyRow, dailyClosing));

    // Same "empty" definition /datas shows (month-card.tsx's monthStatus) —
    // a monthly_metrics row that exists but was cleared back to all-null
    // still counts as empty, not just "no row at all".
    const overlay = resolveDailySourceOverlay(range, allSettingEntries, allClosingEntries);
    const mergedData = { ...(monthlyRow ?? EMPTY_MONTHLY_METRICS), ...overlay.overrides };
    if (monthStatus(computeCompletion(mergedData)) === "empty") {
      emptyMonths.push(monthWindow);
    }
  }

  return {
    settingTotals: sumFunnelTotals(perMonthSetting),
    closingTotals: sumClosingTotals(perMonthClosing),
    cashContractedTotal,
    hasAnyMonthlyRow,
    emptyMonths,
  };
}
