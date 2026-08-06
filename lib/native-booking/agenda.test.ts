import { describe, expect, it } from "vitest";

import { resolveExternalAgendaDuration, projectUnifiedAgendaStatus } from "./agenda";

describe("unified agenda projection", () => {
  it("uses a visual 30-minute estimate when an external call has no duration", () => {
    const scheduledAt = new Date("2026-08-06T10:00:00.000Z");
    expect(resolveExternalAgendaDuration({ scheduledAt, durationMinutes: null })).toEqual({
      endAt: new Date("2026-08-06T10:30:00.000Z"),
      durationMinutes: 30,
      estimated: true,
    });
    expect(resolveExternalAgendaDuration({ scheduledAt, durationMinutes: 45 }).estimated).toBe(false);
  });

  it("keeps cancellation ahead of the past status", () => {
    const now = new Date("2026-08-06T12:00:00.000Z");
    expect(projectUnifiedAgendaStatus(new Date("2026-08-06T09:00:00.000Z"), new Date("2026-08-06T09:30:00.000Z"), false, now)).toBe("past");
    expect(projectUnifiedAgendaStatus(new Date("2026-08-06T09:00:00.000Z"), new Date("2026-08-06T09:30:00.000Z"), true, now)).toBe("cancelled");
  });
});
