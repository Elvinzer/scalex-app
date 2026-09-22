import type { CrmKpiPeriod } from "./kpis";

export const CRM_PERIOD_PRESETS = [
  "today",
  "last-30-days",
  "current-month",
  "previous-month",
  "all",
] as const;

export type CrmPeriodPreset = (typeof CRM_PERIOD_PRESETS)[number];
export type CrmPeriodSelection = CrmKpiPeriod & { preset: CrmPeriodPreset | "custom" };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function endOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));
}

function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function isValidIsoDate(value: string | undefined): value is string {
  if (!value || !ISO_DATE_PATTERN.test(value)) return false;
  return !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime());
}

function customPeriod(from: string, to: string): CrmPeriodSelection {
  return {
    preset: "custom",
    from: new Date(`${from}T00:00:00.000Z`),
    to: new Date(`${to}T23:59:59.999Z`),
  };
}

export function isCrmPeriodPreset(value: string | undefined): value is CrmPeriodPreset {
  return Boolean(value && CRM_PERIOD_PRESETS.includes(value as CrmPeriodPreset));
}

export function resolveCrmPeriod(
  preset: string | undefined,
  from: string | undefined,
  to: string | undefined,
  now = new Date(),
): CrmPeriodSelection {
  const today = utcDay(now);

  if (preset === "today") return { preset: "today", from: startOfDay(today), to: endOfDay(today) };

  if (preset === "last-30-days") {
    return {
      preset: "last-30-days",
      from: new Date(today.getTime() - DAY_MS * 29),
      to: endOfDay(today),
    };
  }

  if (preset === "previous-month") {
    const previousMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    return { preset: "previous-month", from: startOfMonth(previousMonth), to: endOfMonth(previousMonth) };
  }

  if (preset === "all") {
    return { preset: "all", from: new Date(0), to: endOfDay(today) };
  }

  if (preset === "custom" && isValidIsoDate(from) && isValidIsoDate(to) && from <= to) {
    return customPeriod(from, to);
  }

  if (!isCrmPeriodPreset(preset) && isValidIsoDate(from) && isValidIsoDate(to) && from <= to) {
    return customPeriod(from, to);
  }

  return { preset: "current-month", from: startOfMonth(today), to: endOfMonth(today) };
}

export function crmPeriodDateValue(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function formatCrmPeriodDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

export function formatCrmPeriodRange(from: string, to: string, locale: string, joiner: string): string {
  const start = formatCrmPeriodDate(from, locale);
  const end = formatCrmPeriodDate(to, locale);
  return from === to ? start : `${start} ${joiner} ${end}`;
}
