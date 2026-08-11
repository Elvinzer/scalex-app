import { describe, expect, it } from "vitest";

import { resolveDailySourceOverlay, stripDailySourcedFields } from "./resolve";

const RANGE = { from: "2026-08-01", to: "2026-08-31" };
const CALL_SOURCE = { callsBooked: 7, callsTaken: 5, salesClosed: 2, callCount: 7 };

describe("monthly source overlay", () => {
  it("prioritizes Suivi d'appel for bookings, attended calls and closed sales", () => {
    const overlay = resolveDailySourceOverlay(RANGE, [], [], {}, CALL_SOURCE);

    expect(overlay).toMatchObject({
      settingSourced: false,
      callsBookedSourced: true,
      closingSourced: true,
      closingSource: "calls",
      overrides: { callsBooked: 7, callsTaken: 5, salesClosed: 2 },
    });
    expect(stripDailySourcedFields({
      cashCollected: null,
      cashContracted: null,
      newFollowers: 12,
      firstMessages: 18,
      conversations: 9,
      callsProposed: 8,
      callsBooked: 7,
      callsTaken: 5,
      salesClosed: 2,
    }, overlay)).toMatchObject({ callsBooked: null, callsTaken: null, salesClosed: null });
  });

  it("allows a deliberate monthly override to take back control", () => {
    const overlay = resolveDailySourceOverlay(RANGE, [], [], { settingManualOverride: true, closingManualOverride: true }, CALL_SOURCE);

    expect(overlay).toMatchObject({
      settingSourced: false,
      callsBookedSourced: false,
      closingSourced: false,
      closingSource: null,
      overrides: {},
    });
  });

  it("falls back to daily values when the only connected calls were cancelled", () => {
    const overlay = resolveDailySourceOverlay(
      RANGE,
      [],
      [{
        id: "closing-1",
        userId: "user-1",
        date: "2026-08-12",
        callsAttended: 3,
        salesClosed: 1,
        enteredByUserId: null,
        createdAt: new Date("2026-08-12T00:00:00.000Z"),
        updatedAt: new Date("2026-08-12T00:00:00.000Z"),
      }],
      {},
      { callsBooked: 0, callsTaken: 0, salesClosed: 0, callCount: 2 }
    );

    expect(overlay).toMatchObject({
      callsBookedSourced: false,
      closingSourced: true,
      closingSource: "daily",
      overrides: { callsTaken: 3, salesClosed: 1 },
    });
  });
});
