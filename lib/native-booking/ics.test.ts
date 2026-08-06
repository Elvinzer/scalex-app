import { describe, expect, it } from "vitest";

import { createNativeBookingIcs } from "./ics";

describe("native booking calendar export", () => {
  it("exports UTC dates and useful context without management tokens", () => {
    const ics = createNativeBookingIcs({
      uid: "booking@example.com",
      startAt: new Date("2026-08-06T12:00:00.000Z"),
      endAt: new Date("2026-08-06T12:30:00.000Z"),
      title: "Appel stratégique",
      timeZone: "Europe/Paris",
      closerName: "Cédric",
      instructions: "Prépare tes chiffres",
      meetingUrl: "https://meet.example.test/room",
    });

    expect(ics).toContain("DTSTART:20260806T120000Z");
    expect(ics).toContain("DTEND:20260806T123000Z");
    expect(ics).toContain("Closer : Cédric");
    expect(ics).not.toContain("cancellationToken");
    expect(ics).not.toContain("rescheduleToken");
  });
});
