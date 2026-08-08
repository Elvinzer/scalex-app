import { toIsoDate, todayUtc } from "@/lib/date-range";

export function mondayOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - daysFromMonday);
  return monday;
}

export function weekStartForDate(date: Date = todayUtc()): string {
  return toIsoDate(mondayOfWeek(date));
}

export function currentWeekStart(): string {
  return weekStartForDate(todayUtc());
}

export function previousWeekStart(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return toIsoDate(date);
}

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}
