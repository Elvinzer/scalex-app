import { describe, expect, it } from "vitest";

import { resolveCrmPeriod } from "./period";

const now = new Date("2026-09-22T14:00:00.000Z");

describe("CRM period presets", () => {
  it("keeps the requested presets on UTC calendar boundaries", () => {
    expect(resolveCrmPeriod("today", undefined, undefined, now)).toMatchObject({
      preset: "today",
      from: new Date("2026-09-22T00:00:00.000Z"),
      to: new Date("2026-09-22T23:59:59.999Z"),
    });
    expect(resolveCrmPeriod("last-30-days", undefined, undefined, now)).toMatchObject({
      preset: "last-30-days",
      from: new Date("2026-08-24T00:00:00.000Z"),
      to: new Date("2026-09-22T23:59:59.999Z"),
    });
    expect(resolveCrmPeriod("current-month", undefined, undefined, now)).toMatchObject({
      preset: "current-month",
      from: new Date("2026-09-01T00:00:00.000Z"),
      to: new Date("2026-09-30T23:59:59.999Z"),
    });
    expect(resolveCrmPeriod("previous-month", undefined, undefined, now)).toMatchObject({
      preset: "previous-month",
      from: new Date("2026-08-01T00:00:00.000Z"),
      to: new Date("2026-08-31T23:59:59.999Z"),
    });
    expect(resolveCrmPeriod("all", undefined, undefined, now)).toMatchObject({
      preset: "all",
      from: new Date(0),
      to: new Date("2026-09-22T23:59:59.999Z"),
    });
  });

  it("accepts a valid custom range and falls back safely", () => {
    expect(resolveCrmPeriod("custom", "2026-09-04", "2026-09-12", now)).toMatchObject({
      preset: "custom",
      from: new Date("2026-09-04T00:00:00.000Z"),
      to: new Date("2026-09-12T23:59:59.999Z"),
    });
    expect(resolveCrmPeriod("custom", "2026-09-12", "2026-09-04", now).preset).toBe("current-month");
  });
});
