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
    if (record.outcome === "closed") totals.salesClosed += 1;
    byMonth[key] = totals;
  }

  return byMonth;
}
