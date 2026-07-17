import type { closingKpiEntries } from "@/db/schema";
import { rate } from "@/lib/setting/funnel";

type ClosingKpiEntry = typeof closingKpiEntries.$inferSelect;

export type ClosingTotals = {
  callsAttended: number;
  salesClosed: number;
};

export function aggregateClosingEntries(entries: ClosingKpiEntry[]): ClosingTotals {
  return entries.reduce<ClosingTotals>(
    (totals, entry) => ({
      callsAttended: totals.callsAttended + entry.callsAttended,
      salesClosed: totals.salesClosed + entry.salesClosed,
    }),
    { callsAttended: 0, salesClosed: 0 }
  );
}

export type ClosingRates = {
  closingRate: number | null;
  noShowRate: number | null;
};

// callsBooked comes from settingKpiEntries (a different table), summed over
// the same period — not part of ClosingTotals since it isn't closing's own data.
export function computeClosingRates(totals: ClosingTotals, callsBooked: number): ClosingRates {
  return {
    closingRate: rate(totals.salesClosed, totals.callsAttended),
    // Clamped at 0: a mismatch between the two tables' periods could put
    // callsAttended above callsBooked, which shouldn't render as a negative rate.
    noShowRate: rate(Math.max(callsBooked - totals.callsAttended, 0), callsBooked),
  };
}
