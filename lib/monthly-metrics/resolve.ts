import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { aggregateClosingEntries, type ClosingTotals } from "@/lib/closing/metrics";
import { toIsoDate, todayUtc, type DateRange } from "@/lib/date-range";
import { aggregateEntries, type FunnelTotals } from "@/lib/setting/funnel";

import { toClosingTotals, toFunnelTotals } from "./rates";
import { isMonthlyCallSourceAuthoritative, type MonthlyCallSource } from "./call-source";
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
  if (monthlyRow?.settingManualOverride || (monthlyRow && SETTING_FIELDS.some((field) => monthlyRow[field] !== null))) {
    return toFunnelTotals(monthlyRow);
  }
  return aggregateEntries(dailyEntriesInMonth);
}

export function resolveMonthClosingTotals(
  monthlyRow: MonthlyMetricsRow | null,
  dailyEntriesInMonth: ClosingEntry[]
): ClosingTotals {
  if (monthlyRow?.closingManualOverride || (monthlyRow && CLOSING_FIELDS.some((field) => monthlyRow[field] !== null))) {
    return toClosingTotals(monthlyRow);
  }
  return aggregateClosingEntries(dailyEntriesInMonth);
}

export type DailySourceOverlay = {
  settingSourced: boolean;
  callsBookedSourced: boolean;
  callsTakenSourced: boolean;
  salesClosedSourced: boolean;
  closingSourced: boolean;
  closingSource: "calls" | "sales" | "daily" | null;
  overrides: Partial<MonthlyMetricsInput>;
};

export type MonthlySourceOverrides = {
  settingManualOverride?: boolean;
  closingManualOverride?: boolean;
};

export type MonthlySourceResolutionOptions = {
  callTrackingConnected?: boolean;
  salesClosed?: number;
};

// Every field the check-in/month form asks for that is already covered by a
// connected call or daily Setting/Closing source this month stays on that
// source. Monthly overrides still apply to daily Setting/Closing fields, but
// they never take back control from a connected call source or the sales
// ledger.
export function resolveDailySourceOverlay(
  monthRange: DateRange,
  dailySettingEntries: SettingEntry[],
  dailyClosingEntries: ClosingEntry[],
  monthlySourceOverrides: MonthlySourceOverrides = {},
  monthlyCallSource: MonthlyCallSource | null = null,
  options: MonthlySourceResolutionOptions = {}
): DailySourceOverlay {
  const settingThisMonth = dailySettingEntries.filter((entry) => entry.date >= monthRange.from && entry.date <= monthRange.to);
  const closingThisMonth = dailyClosingEntries.filter((entry) => entry.date >= monthRange.from && entry.date <= monthRange.to);

  const settingSourced = settingThisMonth.length > 0 && !monthlySourceOverrides.settingManualOverride;
  const callSourceAvailable = isMonthlyCallSourceAuthoritative(monthlyCallSource, options.callTrackingConnected);
  const salesSourceAvailable = options.salesClosed !== undefined;
  const callsBookedSourced = callSourceAvailable;
  const callsSourced = callSourceAvailable;
  const dailyClosingSourced = closingThisMonth.length > 0 && !monthlySourceOverrides.closingManualOverride;
  const callsTakenSourced = callsSourced;
  const salesClosedSourced = callsSourced || salesSourceAvailable || dailyClosingSourced;
  const closingSourced = callsTakenSourced || salesClosedSourced;
  const overrides: Partial<MonthlyMetricsInput> = {};

  if (settingSourced) {
    const totals = aggregateEntries(settingThisMonth);
    overrides.newFollowers = totals.newSubscribers;
    overrides.firstMessages = totals.firstMessagesSent;
    overrides.conversations = totals.conversationsStarted;
    overrides.callsProposed = totals.callsProposed;
    overrides.callsBooked = totals.callsBooked;
  }
  if (callsBookedSourced) {
    overrides.callsBooked = monthlyCallSource?.callsBooked ?? 0;
  }
  if (callsSourced) {
    overrides.callsTaken = monthlyCallSource?.callsTaken ?? 0;
  } else if (dailyClosingSourced) {
    const totals = aggregateClosingEntries(closingThisMonth);
    overrides.callsTaken = totals.callsAttended;
  }
  if (salesSourceAvailable) {
    overrides.salesClosed = options.salesClosed;
  } else if (callsSourced) {
    overrides.salesClosed = monthlyCallSource?.salesClosed ?? 0;
  } else if (dailyClosingSourced) {
    const totals = aggregateClosingEntries(closingThisMonth);
    overrides.salesClosed = totals.salesClosed;
  }

  return {
    settingSourced,
    callsBookedSourced,
    callsTakenSourced,
    salesClosedSourced,
    closingSourced,
    closingSource: callsSourced ? "calls" : salesSourceAvailable ? "sales" : dailyClosingSourced ? "daily" : null,
    overrides,
  };
}

// Called right before a save — replaces any source-managed field with null so
// the resolver's own fallback (not a frozen snapshot written here) stays
// authoritative going forward.
export function stripDailySourcedFields(
  input: MonthlyMetricsInput,
  overlay: Pick<DailySourceOverlay, "settingSourced"> &
    Partial<Pick<DailySourceOverlay, "callsBookedSourced" | "callsTakenSourced" | "salesClosedSourced" | "closingSourced">>
): MonthlyMetricsInput {
  const result = { ...input };
  if (overlay.settingSourced) {
    for (const field of SETTING_FIELDS) result[field] = null;
  }
  if (overlay.callsBookedSourced) result.callsBooked = null;
  // Older callers only supplied `closingSourced`, which meant both closing
  // fields came from the same daily roll-up. New callers provide granular
  // flags so a sales-ledger source can protect salesClosed without freezing
  // callsTaken, and a daily closing source can still be overridden monthly.
  if (overlay.callsTakenSourced === true || (overlay.callsTakenSourced === undefined && overlay.closingSourced === true)) {
    result.callsTaken = null;
  }
  if (overlay.salesClosedSourced === true || (overlay.salesClosedSourced === undefined && overlay.closingSourced === true)) {
    result.salesClosed = null;
  }
  return result;
}

export type ResolvedField = {
  amount: number | null;
  source: "stripe" | "stripe_stale" | "manual" | "sales" | "combined" | null;
};

// Stripe wins whenever the field is Stripe-sourced (fresh or stale) — manual
// entry is the fallback only, never added together. No live Stripe fetch
// anymore: lib/stripe/sync-write.ts persists the value straight into
// monthly_metrics with a *Source column, so this is now a plain read.
export function resolveMonthCashCollected(monthlyRow: MonthlyMetricsRow | null): ResolvedField {
  if (!monthlyRow) return { amount: null, source: null };
  if (monthlyRow.cashCollectedSource === "stripe" || monthlyRow.cashCollectedSource === "stripe_stale") {
    return { amount: monthlyRow.cashCollected, source: monthlyRow.cashCollectedSource };
  }
  if (monthlyRow.cashCollected !== null) return { amount: monthlyRow.cashCollected, source: "manual" };
  return { amount: null, source: null };
}

// Stripe stores the paying-customer projection. Bank-transfer sales are not in
// that projection, so add valid non-Stripe sales at read time instead of
// writing a second counter into monthly_metrics.
export function resolveMonthNewCustomers(
  monthlyRow: MonthlyMetricsRow | null,
  bankTransferCustomers = 0
): ResolvedField {
  const stripeSource = monthlyRow?.newCustomersSource === "stripe" || monthlyRow?.newCustomersSource === "stripe_stale";
  const stripeCustomers = stripeSource && monthlyRow?.newCustomers !== null && monthlyRow?.newCustomers !== undefined
    ? monthlyRow.newCustomers
    : null;
  const hasBankTransferCustomers = bankTransferCustomers > 0;

  if (stripeCustomers === null && !hasBankTransferCustomers) return { amount: null, source: null };
  if (stripeCustomers !== null && hasBankTransferCustomers) {
    return { amount: stripeCustomers + bankTransferCustomers, source: "combined" };
  }
  if (stripeCustomers !== null) {
    return { amount: stripeCustomers, source: monthlyRow?.newCustomersSource ?? null };
  }
  return { amount: bankTransferCustomers, source: "sales" };
}
