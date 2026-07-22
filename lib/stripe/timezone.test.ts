import { describe, expect, it } from "vitest";

import { yearMonthInTimezone } from "./timezone";

describe("yearMonthInTimezone", () => {
  it("buckets a payment at 00h30 Paris on the 1st into the NEW month, not UTC's previous day", () => {
    // 2026-07-01T00:30:00 in Europe/Paris (UTC+2 in July, DST) is
    // 2026-06-30T22:30:00Z — a raw UTC bucket would wrongly read June.
    const date = new Date("2026-06-30T22:30:00Z");
    expect(yearMonthInTimezone(date, "Europe/Paris")).toEqual({ year: 2026, month: 7 });
  });

  it("buckets a payment late on the last day of the month correctly across DST-less winter offset too", () => {
    // 2026-01-01T00:15 Paris (UTC+1 in January) = 2025-12-31T23:15:00Z.
    const date = new Date("2025-12-31T23:15:00Z");
    expect(yearMonthInTimezone(date, "Europe/Paris")).toEqual({ year: 2026, month: 1 });
  });

  it("matches plain UTC when given the UTC timezone", () => {
    const date = new Date("2026-06-25T12:00:00Z");
    expect(yearMonthInTimezone(date, "UTC")).toEqual({ year: 2026, month: 6 });
  });
});
