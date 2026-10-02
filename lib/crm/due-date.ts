import { addLocalDays, getLocalDateTimeParts, isValidTimeZone, localDateStringFromDate, localDateTimeToUtc } from "@/lib/native-booking/time";

export function getCrmLocalDayBounds(timeZone: string, now = new Date()): { start: Date; end: Date } {
  if (!isValidTimeZone(timeZone)) throw new Error("Fuseau horaire CRM invalide.");

  const localDate = localDateStringFromDate(now, timeZone);
  const nextLocalDate = addLocalDays(localDate, 1);

  return {
    start: localDateTimeToUtc(localDate, "00:00", timeZone),
    end: localDateTimeToUtc(nextLocalDate, "00:00", timeZone),
  };
}

export function formatCrmDateTimeInput(value: Date, timeZone: string): string {
  const parts = getLocalDateTimeParts(value, timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}T${parts.hour.toString().padStart(2, "0")}:${parts.minute.toString().padStart(2, "0")}`;
}

export function parseCrmDateTimeInput(value: string, timeZone: string): Date | null {
  if (!isValidTimeZone(timeZone)) return null;
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/.exec(value);
  if (!match) return null;

  const parsed = localDateTimeToUtc(match[1], match[2], timeZone);
  if (Number.isNaN(parsed.getTime()) || formatCrmDateTimeInput(parsed, timeZone) !== value) return null;
  return parsed;
}

export function getCrmTomorrowAtSameLocalTime(now: Date, timeZone: string, timeSource = now): Date {
  if (!isValidTimeZone(timeZone)) throw new Error("Fuseau horaire CRM invalide.");

  const parts = getLocalDateTimeParts(timeSource, timeZone);
  const tomorrow = addLocalDays(localDateStringFromDate(now, timeZone), 1);
  const localTime = `${parts.hour.toString().padStart(2, "0")}:${parts.minute.toString().padStart(2, "0")}`;
  return localDateTimeToUtc(tomorrow, localTime, timeZone);
}
