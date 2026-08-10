import { describe, expect, it } from "vitest";

import { aggregateSalesCallsByMonth } from "./call-source";

describe("aggregateSalesCallsByMonth", () => {
  it("counts reserved, attended and closed calls independently", () => {
    expect(
      aggregateSalesCallsByMonth([
        { scheduledAt: "2026-08-02T10:00:00.000Z", attendance: "showed", outcome: "closed" },
        { scheduledAt: "2026-08-03T10:00:00.000Z", attendance: "showed", outcome: "not_closed" },
        { scheduledAt: "2026-08-04T10:00:00.000Z", attendance: "no_show", outcome: "pending" },
        { scheduledAt: "2026-08-05T10:00:00.000Z", attendance: "cancelled", outcome: "pending" },
      ])
    ).toEqual({
      "2026-08": { callsBooked: 3, callsTaken: 2, salesClosed: 1, callCount: 4 },
    });
  });

  it("keeps separate calendar months and ignores invalid dates", () => {
    expect(
      aggregateSalesCallsByMonth([
        { scheduledAt: "2026-07-31T23:59:00.000Z", attendance: "showed", outcome: "closed" },
        { scheduledAt: "2026-08-01T00:01:00.000Z", attendance: "booked", outcome: "pending" },
        { scheduledAt: "not-a-date", attendance: "booked", outcome: "pending" },
      ])
    ).toEqual({
      "2026-07": { callsBooked: 1, callsTaken: 1, salesClosed: 1, callCount: 1 },
      "2026-08": { callsBooked: 1, callsTaken: 0, salesClosed: 0, callCount: 1 },
    });
  });
});
