import { describe, expect, it } from "vitest";

import { parseEnvelope, readCall } from "./events";

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
      tracking: { utm_campaign: "minaly-vsl", sx_mt: "b".repeat(64) },
    });

    expect(call?.utmCampaign).toBe("minaly-vsl");
    expect(call?.metaTouchpointToken).toBe("b".repeat(64));
  });

  it("reads the documented iClosed webhook groups and keeps event and call ids separate", () => {
    const raw = {
      hookType: "Call booked",
      eventType: {
        uuid: "event-type-123",
        name: "Strategy call",
        duration: 45,
        durationUnit: "MINUTES",
      },
      event: {
        uuid: "call-456",
        assigned_to: "Alex Closer",
        utc_start_time: "2026-08-09T10:00:00.000Z",
        utc_end_time: "2026-08-09T10:45:00.000Z",
      },
      invitee: {
        uuid: "contact-789",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@example.com",
        text_reminder_number: "+15551234567",
      },
    };

    const envelope = parseEnvelope(raw);
    expect(envelope?.id).toBe("event-type-123");
    expect(envelope?.type).toBe("Call booked");

    const call = envelope ? readCall(envelope) : null;
    expect(call?.iclosedCallId).toBe("call-456");
    expect(call?.inviteeName).toBe("Jane Doe");
    expect(call?.inviteeEmail).toBe("jane@example.com");
    expect(call?.inviteePhone).toBe("+15551234567");
    expect(call?.closer).toBe("Alex Closer");
    expect(call?.durationMinutes).toBe(45);
  });

  it("accepts the legacy envelope wrapper used by existing deliveries", () => {
    const envelope = parseEnvelope({
      id: "delivery-123",
      type: "newCallScheduled",
      data: {
        id: 42,
        dateTimeUTC: "2026-08-08T10:00:00.000Z",
      },
    });

    expect(envelope?.id).toBe("delivery-123");
    expect(envelope?.type).toBe("newCallScheduled");
    expect(envelope ? readCall(envelope)?.iclosedCallId : null).toBe("42");
  });
});
