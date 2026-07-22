import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { aggregateClosingEntries, type ClosingTotals } from "@/lib/closing/metrics";
import { toIsoDate, todayUtc, type DateRange } from "@/lib/date-range";
import { aggregateEntries, type FunnelTotals } from "@/lib/setting/funnel";

import { toClosingTotals, toFunnelTotals } from "./rates";
import type { MonthlyMetricsInput } from "./types";
import type { MonthlyMetricsRow } from "./queries";

type SettingEntry = typeof settingKpiEntries.$inferSelect;
type ClosingEntry = typeof closingKpiEntries.$inferSelect;

export const SETTING_FIELDS = ["newFollowers", "firstMessages", "conversations", "callsProposed", "callsBooked"] as const;
export const CLOSING_FIELDS = ["callsTaken", "salesClosed"] as const;

// True only when `range` is exactly one full calendar month — either a
// completed month, or the still-in-progress current month (to = today).
export function isExactCalendarMonth(range: DateRange): { year: number; month: number } | null {
  const fromDate = new Date(`${range.from}T00:00:00Z`);
  if (fromDate.getUTCDate() !== 1) return null;

  const year = fromDate.getUTCFullYear();
  const month = fromDate.getUTCMonth() + 1;
  const lastDayIso = toIsoDate(new Date(Date.UTC(year, month, 0)));

  const today = todayUtc();
  const isCurrentMonth = year === today.getUTCFullYear() && month === today.getUTCMonth() + 1;

  if (range.to === lastDayIso || (isCurrentMonth && range.to === toIsoDate(today))) {
    return { year, month };
  }
  return null;
}

// Whole-section priority, not a field-by-field blend: if the monthly row has
// ANY non-null field in this section, it wins entirely over daily entries —
// keeps the merge simple and auditable (never a mix of manual + daily counts
// in the same total).
export function resolveMonthSettingTotals(
  monthlyRow: MonthlyMetricsRow | null,
  dailyEntriesInMonth: SettingEntry[]
): FunnelTotals {
  if (monthlyRow && SETTING_FIELDS.some((field) => monthlyRow[field] !== null)) {
    return toFunnelTotals(monthlyRow);
  }
  return aggregateEntries(dailyEntriesInMonth);
}

export function resolveMonthClosingTotals(
  monthlyRow: MonthlyMetricsRow | null,
  dailyEntriesInMonth: ClosingEntry[]
): ClosingTotals {
  if (monthlyRow && CLOSING_FIELDS.some((field) => monthlyRow[field] !== null)) {
    return toClosingTotals(monthlyRow);
  }
  return aggregateClosingEntries(dailyEntriesInMonth);
}

export type DailySourceOverlay = {
  settingSourced: boolean;
  closingSourced: boolean;
  overrides: Partial<MonthlyMetricsInput>;
};

// Every field the check-in/month form asks for that's already covered by a
// daily Setting/Closing entry this month — the form should show these (not
// the monthly row's own value) and disable editing, so there's only ever one
// place to type each number. Whole-section, same granularity as
// resolveMonthSettingTotals/resolveMonthClosingTotals above.
export function resolveDailySourceOverlay(
  monthRange: DateRange,
  dailySettingEntries: SettingEntry[],
  dailyClosingEntries: ClosingEntry[]
): DailySourceOverlay {
  const settingThisMonth = dailySettingEntries.filter((entry) => entry.date >= monthRange.from && entry.date <= monthRange.to);
  const closingThisMonth = dailyClosingEntries.filter((entry) => entry.date >= monthRange.from && entry.date <= monthRange.to);

  const settingSourced = settingThisMonth.length > 0;
  const closingSourced = closingThisMonth.length > 0;
  const overrides: Partial<MonthlyMetricsInput> = {};

  if (settingSourced) {
    const totals = aggregateEntries(settingThisMonth);
    overrides.newFollowers = totals.newSubscribers;
    overrides.firstMessages = totals.firstMessagesSent;
    overrides.conversations = totals.conversationsStarted;
    overrides.callsProposed = totals.callsProposed;
    overrides.callsBooked = totals.callsBooked;
  }
  if (closingSourced) {
    const totals = aggregateClosingEntries(closingThisMonth);
    overrides.callsTaken = totals.callsAttended;
    overrides.salesClosed = totals.salesClosed;
  }

  return { settingSourced, closingSourced, overrides };
}

// Called right before a save — replaces any daily-sourced field with null so
// resolveMonthSettingTotals/resolveMonthClosingTotals's own fallback (not a
// frozen snapshot written here) stays authoritative going forward.
export function stripDailySourcedFields(
  input: MonthlyMetricsInput,
  overlay: Pick<DailySourceOverlay, "settingSourced" | "closingSourced">
): MonthlyMetricsInput {
  const result = { ...input };
  if (overlay.settingSourced) {
    for (const field of SETTING_FIELDS) result[field] = null;
  }
  if (overlay.closingSourced) {
    for (const field of CLOSING_FIELDS) result[field] = null;
  }
  return result;
}

export type ResolvedCashCollected = { amount: number | null; source: "stripe" | "manual" | null };

// Stripe wins whenever it has data for the month — manual entry is the
// fallback only, never added together.
export function resolveMonthCashCollected(
  monthlyRow: MonthlyMetricsRow | null,
  stripeRevenueForMonth: number | null
): ResolvedCashCollected {
  if (stripeRevenueForMonth !== null) return { amount: stripeRevenueForMonth, source: "stripe" };
  if (monthlyRow?.cashCollected !== null && monthlyRow?.cashCollected !== undefined) {
    return { amount: monthlyRow.cashCollected, source: "manual" };
  }
  return { amount: null, source: null };
}
