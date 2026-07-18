import type { ClosingTotals } from "@/lib/closing/metrics";
import { rate } from "@/lib/setting/funnel";
import type { FunnelTotals } from "@/lib/setting/funnel";

import type { MonthlyMetricsInput } from "./types";

// Adapters, not new rate math — map monthly_metrics' nullable columns onto
// the existing FunnelTotals/ClosingTotals shapes (null -> 0) so callers reuse
// computeFunnelRates/computeClosingRates/rate() directly. Guarantees the
// exact same numbers as the daily-entry system for the same underlying math.
export function toFunnelTotals(data: MonthlyMetricsInput): FunnelTotals {
  return {
    newSubscribers: data.newFollowers ?? 0,
    firstMessagesSent: data.firstMessages ?? 0,
    conversationsStarted: data.conversations ?? 0,
    callsProposed: data.callsProposed ?? 0,
    callsBooked: data.callsBooked ?? 0,
  };
}

export function toClosingTotals(data: MonthlyMetricsInput): ClosingTotals {
  return {
    callsAttended: data.callsTaken ?? 0,
    salesClosed: data.salesClosed ?? 0,
  };
}

// Revenue per call — a new ratio not covered by lib/setting/funnel.ts or
// lib/closing/metrics.ts, but rate()'s null/zero-denominator guard (-> "—")
// applies unchanged to any numerator/denominator pair.
export function revenuePerCall(cashContracted: number | null, callsTaken: number | null): number | null {
  return rate(cashContracted ?? 0, callsTaken ?? 0);
}
