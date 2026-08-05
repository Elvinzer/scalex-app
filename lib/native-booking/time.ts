const DATE_PARTS_FORMATTER_CACHE = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = DATE_PARTS_FORMATTER_CACHE.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      calendar: "iso8601",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    DATE_PARTS_FORMATTER_CACHE.set(timeZone, formatter);
  }
  return formatter;
}

export type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function getLocalDateTimeParts(date: Date, timeZone: string): LocalDateTimeParts {
  const parts = getPartsFormatter(timeZone).formatToParts(date);
  const values = new Map(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return {
    year: values.get("year") ?? date.getUTCFullYear(),
    month: values.get("month") ?? date.getUTCMonth() + 1,
    day: values.get("day") ?? date.getUTCDate(),
    hour: values.get("hour") ?? date.getUTCHours(),
    minute: values.get("minute") ?? date.getUTCMinutes(),
    second: values.get("second") ?? date.getUTCSeconds(),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getLocalDateTimeParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function localDateTimeToUtc(dateString: string, timeString: string, timeZone: string): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  const [hour, minute] = timeString.split(":").map(Number);
  const desiredUtcClock = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = new Date(desiredUtcClock);

  // Two passes are enough for normal zones and DST transitions. The second
  // pass corrects the offset using the candidate's actual local date.
  for (let index = 0; index < 3; index += 1) {
    guess = new Date(desiredUtcClock - getTimeZoneOffsetMs(guess, timeZone));
  }
  return guess;
}

export function localDateStringFromDate(date: Date, timeZone: string): string {
  const parts = getLocalDateTimeParts(date, timeZone);
  return `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day
    .toString()
    .padStart(2, "0")}`;
}

export function addLocalDays(dateString: string, days: number): string {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear().toString().padStart(4, "0")}-${(date.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}-${date.getUTCDate().toString().padStart(2, "0")}`;
}

export function weekdayForDate(dateString: string): number {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function minutesFromTime(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function formatMinutesAsTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

export function formatDateTimeInTimeZone(date: Date, timeZone: string, locale = "fr-FR"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(date);
}

export function formatTimeInTimeZone(date: Date, timeZone: string, locale = "fr-FR"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
