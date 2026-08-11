import { describe, expect, it } from "vitest";

import { currentMonthWindow, monthWindowFor } from "@/lib/diagnostic/completed-months";

import { isSameReportingMonth, resolveContentReportingMonth } from "./reporting-period";

describe("resolveContentReportingMonth", () => {
  it("uses the current month when imported content exists in it", () => {
    const current = monthWindowFor(2026, 8);

    expect(resolveContentReportingMonth([{ publishedAt: "2026-08-03" }], current)).toEqual(current);
  });

  it("falls back to the latest month containing imported content", () => {
    const current = monthWindowFor(2026, 8);

    expect(resolveContentReportingMonth([
      { publishedAt: "2026-06-12" },
      { publishedAt: "2026-07-28" },
    ], current)).toEqual(monthWindowFor(2026, 7));
  });

  it("keeps the current month when there is no content to report", () => {
    const current = currentMonthWindow();

    expect(resolveContentReportingMonth([], current)).toEqual(current);
  });

  it("does not treat a fallback content month as the current reporting month", () => {
    expect(isSameReportingMonth(monthWindowFor(2026, 6), monthWindowFor(2026, 8))).toBe(false);
    expect(isSameReportingMonth(monthWindowFor(2026, 8), monthWindowFor(2026, 8))).toBe(true);
  });
});
