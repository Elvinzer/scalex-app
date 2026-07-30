// Shared period filter for the sales / calls / KPI views. A single source of
// truth so the selector, the KPI computations and the table filtering all agree.

export type PeriodKey = "this_month" | "last_month" | "last_30d" | "last_90d" | "this_year" | "all";

export const DEFAULT_PERIOD: PeriodKey = "this_month";

export const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: "this_month", label: "Ce mois" },
  { key: "last_month", label: "Mois dernier" },
  { key: "last_30d", label: "30 j" },
  { key: "last_90d", label: "90 j" },
  { key: "this_year", label: "Cette année" },
  { key: "all", label: "Tout" },
];

export type ResolvedPeriod = { key: PeriodKey; start: Date | null; end: Date | null };

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0));
}

export function resolvePeriod(raw?: string | null): ResolvedPeriod {
  const key = (PERIOD_OPTIONS.find((p) => p.key === raw)?.key ?? DEFAULT_PERIOD) as PeriodKey;
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  switch (key) {
    case "this_month":
      return { key, start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 0, 23, 59, 59)) };
    case "last_month":
      return { key, start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 0, 23, 59, 59)) };
    case "last_30d": {
      const s = new Date(now);
      s.setUTCDate(s.getUTCDate() - 30);
      return { key, start: startOfDayUTC(s), end: now };
    }
    case "last_90d": {
      const s = new Date(now);
      s.setUTCDate(s.getUTCDate() - 90);
      return { key, start: startOfDayUTC(s), end: now };
    }
    case "this_year":
      return { key, start: new Date(Date.UTC(y, 0, 1)), end: new Date(Date.UTC(y, 11, 31, 23, 59, 59)) };
    case "all":
    default:
      return { key: "all", start: null, end: null };
  }
}

export function isInPeriod(period: ResolvedPeriod, date: Date): boolean {
  if (Number.isNaN(date.getTime())) return false;
  if (period.start && date < period.start) return false;
  if (period.end && date > period.end) return false;
  return true;
}

// sales.saleDate is a plain "YYYY-MM-DD" string — parse at UTC midnight.
export function dateFromDayString(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}
