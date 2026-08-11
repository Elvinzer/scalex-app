export type SalesCallKpiRecord = {
  scheduledAt: Date | string;
  attendance: "booked" | "showed" | "no_show" | "cancelled";
  outcome: "pending" | "closed" | "not_closed" | "awaiting_decision";
};

export type MonthlyCallSource = {
  callsBooked: number;
  callsTaken: number;
  salesClosed: number;
  callCount: number;
};

// A source is available only when it contains a meaningful business event.
// `callCount` also includes cancelled appointments so it must not be used as
// the precedence signal: a month containing only cancellations must still
// fall back to the manual/daily KPI source.
export function isMonthlyCallSourceAvailable(source: MonthlyCallSource | null | undefined): boolean {
  return Boolean(source && (source.callsBooked > 0 || source.callsTaken > 0 || source.salesClosed > 0));
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function monthKeyFromDate(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return monthKey(date.getUTCFullYear(), date.getUTCMonth() + 1);
}

export function aggregateSalesCallsByMonth(records: readonly SalesCallKpiRecord[]): Record<string, MonthlyCallSource> {
  const byMonth: Record<string, MonthlyCallSource> = {};

  for (const record of records) {
    const key = monthKeyFromDate(record.scheduledAt);
    if (!key) continue;

    const totals = byMonth[key] ?? { callsBooked: 0, callsTaken: 0, salesClosed: 0, callCount: 0 };
    totals.callCount += 1;
    if (record.attendance !== "cancelled") totals.callsBooked += 1;
    if (record.attendance === "showed") totals.callsTaken += 1;
    if (record.attendance !== "cancelled" && record.outcome === "closed") totals.salesClosed += 1;
    byMonth[key] = totals;
  }

  return byMonth;
}

export function aggregateSalesCallsInRange(
  records: readonly SalesCallKpiRecord[],
  range?: { from: string; to: string }
): MonthlyCallSource {
  const inRange = range
    ? records.filter((record) => {
        const date = record.scheduledAt instanceof Date
          ? record.scheduledAt.toISOString().slice(0, 10)
          : new Date(record.scheduledAt).toISOString().slice(0, 10);
        return date >= range.from && date <= range.to;
      })
    : records;
  return Object.values(aggregateSalesCallsByMonth(inRange)).reduce(
    (sum, month) => ({
      callsBooked: sum.callsBooked + month.callsBooked,
      callsTaken: sum.callsTaken + month.callsTaken,
      salesClosed: sum.salesClosed + month.salesClosed,
      callCount: sum.callCount + month.callCount,
    }),
    { callsBooked: 0, callsTaken: 0, salesClosed: 0, callCount: 0 }
  );
}
