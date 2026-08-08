import { describe, expect, it } from "vitest";

import { readCall } from "./events";

describe("iClosed call normalization", () => {
  it("reads the invitee phone exposed directly on an event call", () => {
    const call = readCall({
      id: 42,
      dateTimeUTC: "2026-08-08T10:00:00.000Z",
      inviteeName: "Jane Doe",
      phoneNumber: "+15551234567",
    });

    expect(call?.inviteePhone).toBe("+15551234567");
  });

  it("falls back to a phone answer when the direct field is absent", () => {
    const call = readCall({
      id: 43,
      dateTimeUTC: "2026-08-08T10:00:00.000Z",
      questions: [{ statement: "Phone number", answer: "+15557654321" }],
    });

    expect(call?.inviteePhone).toBe("+15557654321");
  });

  it("keeps Meta tracking fields without exposing the opaque token as a domain value", () => {
    const call = readCall({
      id: 44,
      dateTimeUTC: "2026-08-08T10:00:00.000Z",
      tracking: { utm_campaign: "scale-x-vsl", sx_mt: "b".repeat(64) },
    });

    expect(call?.utmCampaign).toBe("scale-x-vsl");
    expect(call?.metaTouchpointToken).toBe("b".repeat(64));
  });
});
