import { toIsoDate, todayUtc, type DateRange } from "@/lib/date-range";

export type MonthWindow = { year: number; month: number; range: DateRange };

// Last `count` FULLY completed calendar months, oldest first — excludes the
// current in-progress month (unlike lib/dashboard/metrics.ts's private
// monthBuckets, which deliberately includes it for the Dashboard's own
// "this month so far" framing; different semantics, not shared).
export function lastCompletedMonths(count: number): MonthWindow[] {
  const today = todayUtc();
  const windows: MonthWindow[] = [];

  for (let i = count; i >= 1; i--) {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const year = first.getUTCFullYear();
    const month = first.getUTCMonth() + 1;
    const last = new Date(Date.UTC(year, month, 0));
    windows.push({ year, month, range: { from: toIsoDate(first), to: toIsoDate(last) } });
  }

  return windows;
}

// "current-month" period option — the in-progress month, up to today.
export function currentMonthWindow(): MonthWindow {
  const today = todayUtc();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const first = new Date(Date.UTC(year, month - 1, 1));
  return { year, month, range: { from: toIsoDate(first), to: toIsoDate(today) } };
}
