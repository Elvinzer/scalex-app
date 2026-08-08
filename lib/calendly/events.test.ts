import { describe, expect, it } from "vitest";

import { normalizeScheduledEvent, parseCalendlyWebhook } from "./events";

describe("Calendly call normalization", () => {
  it("reads the invitee text reminder number", () => {
    const call = normalizeScheduledEvent(
      {
        uri: "https://api.calendly.com/scheduled_events/event-1",
        start_time: "2026-08-08T10:00:00.000Z",
        name: "Discovery call",
      },
      {
        name: "Jane Doe",
        email: "jane@example.com",
        text_reminder_number: "+15551234567",
      }
    );

    expect(call?.inviteePhone).toBe("+15551234567");
  });

  it("falls back to a phone question answer in webhooks", () => {
    const parsed = parseCalendlyWebhook({
      event: "invitee.created",
      payload: {
        uri: "https://api.calendly.com/scheduled_events/event-2/invitees/invitee-2",
        name: "Jane Doe",
        email: "jane@example.com",
        questions_and_answers: [{ question: "Téléphone", answer: "+15557654321" }],
        scheduled_event: {
          uri: "https://api.calendly.com/scheduled_events/event-2",
          start_time: "2026-08-08T10:00:00.000Z",
          name: "Discovery call",
        },
      },
    });

    expect(parsed?.call?.inviteePhone).toBe("+15557654321");
  });
});
