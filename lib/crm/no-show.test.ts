import { describe, expect, it } from "vitest";

import { getNoShowFollowUpDueAt } from "./no-show";

describe("getNoShowFollowUpDueAt", () => {
  it("schedules the follow-up two hours after the planned call", () => {
    const scheduledAt = new Date("2026-09-21T10:00:00.000Z");
    const recordedAt = new Date("2026-09-21T10:15:00.000Z");

    expect(getNoShowFollowUpDueAt(scheduledAt, recordedAt).toISOString()).toBe("2026-09-21T12:00:00.000Z");
  });

  it("never schedules the follow-up before a late no-show is recorded", () => {
    const scheduledAt = new Date("2026-09-21T10:00:00.000Z");
    const recordedAt = new Date("2026-09-21T14:30:00.000Z");

    expect(getNoShowFollowUpDueAt(scheduledAt, recordedAt).toISOString()).toBe("2026-09-21T14:30:00.000Z");
  });

  it("falls back to two hours after recording when no call time is available", () => {
    const recordedAt = new Date("2026-09-21T14:30:00.000Z");

    expect(getNoShowFollowUpDueAt(null, recordedAt).toISOString()).toBe("2026-09-21T16:30:00.000Z");
  });
});
