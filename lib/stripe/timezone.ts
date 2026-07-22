// Buckets a Stripe timestamp into the account's calendar month — never a
// raw UTC conversion, never a comparison by timestamp (a payment at 00h30
// Paris on the 1st is 23h30 UTC the day before, which would land on the
// WRONG month if bucketed in UTC). `timeZone` is a real parameter (IANA
// name, e.g. "Europe/Paris") rather than hardcoded here — call sites
// default to "Europe/Paris" for now; a per-account setting is a fast-follow.
export function yearMonthInTimezone(date: Date, timeZone: string): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric" }).formatToParts(date);
  const year = Number(parts.find((p) => p.type === "year")!.value);
  const month = Number(parts.find((p) => p.type === "month")!.value);
  return { year, month };
}

export const DEFAULT_STRIPE_TIMEZONE = "Europe/Paris";
