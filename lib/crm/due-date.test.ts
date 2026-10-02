import { describe, expect, it } from "vitest";

import { formatCrmDateTimeInput, getCrmLocalDayBounds, getCrmTomorrowAtSameLocalTime, parseCrmDateTimeInput } from "./due-date";

describe("CRM local due-date boundaries", () => {
  it("uses the selected timezone instead of the server timezone", () => {
    const now = new Date("2026-10-02T00:30:00.000Z");

    expect(getCrmLocalDayBounds("America/Los_Angeles", now)).toEqual({
      start: new Date("2026-10-01T07:00:00.000Z"),
      end: new Date("2026-10-02T07:00:00.000Z"),
    });
    expect(getCrmLocalDayBounds("Asia/Tokyo", now)).toEqual({
      start: new Date("2026-10-01T15:00:00.000Z"),
      end: new Date("2026-10-02T15:00:00.000Z"),
    });
  });

  it("keeps local midnight correct across daylight-saving changes", () => {
    const springForward = getCrmLocalDayBounds("America/New_York", new Date("2026-03-08T16:00:00.000Z"));
    const fallBack = getCrmLocalDayBounds("Europe/Paris", new Date("2026-10-25T12:00:00.000Z"));

    expect(springForward.start.toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(springForward.end.toISOString()).toBe("2026-03-09T04:00:00.000Z");
    expect(fallBack.start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(fallBack.end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("rejects an invalid timezone", () => {
    expect(() => getCrmLocalDayBounds("invalid/timezone", new Date())).toThrow("Fuseau horaire CRM invalide.");
  });

  it("round trips reschedule values in the selected local timezone", () => {
    const dueAt = new Date("2026-10-02T08:30:00.000Z");
    const localValue = formatCrmDateTimeInput(dueAt, "Europe/Paris");

    expect(localValue).toBe("2026-10-02T10:30");
    expect(parseCrmDateTimeInput(localValue, "Europe/Paris")?.toISOString()).toBe(dueAt.toISOString());
  });

  it("rejects local times that do not exist during the spring daylight-saving change", () => {
    expect(parseCrmDateTimeInput("2026-03-08T02:30", "America/New_York")).toBeNull();
  });

  it("keeps the local hour when postponing across a daylight-saving change", () => {
    const now = new Date("2026-03-07T15:30:00.000Z");
    const originalDueAt = new Date("2026-03-06T15:30:00.000Z");
    const tomorrow = getCrmTomorrowAtSameLocalTime(now, "America/New_York", originalDueAt);

    expect(formatCrmDateTimeInput(tomorrow, "America/New_York")).toBe("2026-03-08T10:30");
  });
});
