// The calendar's 6px health dot is a deliberately rough glance-indicator,
// NOT a real diagnostic score — the cascade engine's own scoring
// (lib/diagnostic/cascade.ts) requires MIN_VOLUME=30 to avoid noisy
// single-day ratios, which a single day almost never reaches. Forcing that
// engine onto one day's numbers would show "unmeasured" almost always,
// defeating the point. This is intentionally simpler and documented as such
// so it's never mistaken for a real rate elsewhere.
export type DayEntryTotals = {
  newSubscribers: number;
  firstMessagesSent: number;
  conversationsStarted: number;
  callsProposed: number;
  callsBooked: number;
  callsAttended: number;
  salesClosed: number;
};

export const EMPTY_DAY_TOTALS: DayEntryTotals = {
  newSubscribers: 0,
  firstMessagesSent: 0,
  conversationsStarted: 0,
  callsProposed: 0,
  callsBooked: 0,
  callsAttended: 0,
  salesClosed: 0,
};

function hasSettingActivity(day: DayEntryTotals): boolean {
  return (
    day.newSubscribers > 0 ||
    day.firstMessagesSent > 0 ||
    day.conversationsStarted > 0 ||
    day.callsProposed > 0 ||
    day.callsBooked > 0
  );
}

// null = no dot (nothing logged that day). Otherwise a 0-100 value meant
// only for getHealthTier's color, never displayed as a number.
export function computeRoughDayScore(day: DayEntryTotals): number | null {
  if (day.callsAttended > 0) {
    return Math.max(0, Math.min(100, Math.round((day.salesClosed / day.callsAttended) * 100)));
  }
  if (day.firstMessagesSent > 0) {
    return Math.max(0, Math.min(100, Math.round((day.conversationsStarted / day.firstMessagesSent) * 100)));
  }
  if (hasSettingActivity(day)) return 50; // logged something (e.g. new subscribers only), no rate computable yet
  return null;
}
