import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import {
  createExternalCalendarEvent,
  getPrimaryCalendarOption,
  listBusyForConnection,
  listCalendarsForConnection,
  updateExternalCalendarEvent,
  type CalendarConnection,
} from "./calendar";
import { encrypt } from "@/lib/crypto";

const baseConnection = {
  id: "00000000-0000-0000-0000-000000000001",
  userId: "00000000-0000-0000-0000-000000000002",
  closerUserId: "00000000-0000-0000-0000-000000000003",
  provider: "google" as const,
  providerAccountSubject: "google-subject",
  providerAccountEmail: "closer@example.com",
  accessTokenEncrypted: null,
  refreshTokenEncrypted: null,
  tokenExpiresAt: null,
  selectedCalendarIds: ["fixture-primary"],
  status: "connected" as const,
  lastError: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
} satisfies CalendarConnection;

describe("native booking calendar adapter", () => {
  beforeEach(() => {
    process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE = "1";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE = "1";
  });

  it("exposes writable calendars for the settings resolver", async () => {
    await expect(listCalendarsForConnection(baseConnection)).resolves.toEqual([
      { id: "fixture-primary", name: "Agenda fixture principale", isPrimary: true, canWrite: true },
      { id: "fixture-team", name: "Agenda fixture équipe", isPrimary: false, canWrite: true },
    ]);
  });

  it("resolves the account primary calendar instead of a secondary calendar", () => {
    expect(
      getPrimaryCalendarOption([
        { id: "fixture-team", name: "Agenda équipe", isPrimary: false, canWrite: true },
        { id: "fixture-primary", name: "Agenda principale", isPrimary: true, canWrite: true },
      ])
    ).toEqual({ id: "fixture-primary", name: "Agenda principale", isPrimary: true, canWrite: true });
    expect(getPrimaryCalendarOption([{ id: "fixture-team", name: "Agenda équipe", isPrimary: false, canWrite: true }])).toBeNull();
  });

  it("reuses one deterministic event and Meet link for an idempotent retry", async () => {
    const request = {
      connection: baseConnection,
      calendarId: "fixture-team",
      idempotencyKey: "booking-123",
      title: "Appel stratégique",
      description: "Description",
      startAt: new Date("2026-08-20T09:00:00.000Z"),
      endAt: new Date("2026-08-20T10:00:00.000Z"),
      guestName: "Prospect Test",
      guestEmail: "prospect@example.com",
      meetingUrl: null,
    };
    const first = await createExternalCalendarEvent(request);
    const second = await createExternalCalendarEvent(request);

    expect(second).toEqual(first);
    expect(first.meetingUrl).toBe(`https://meet.fixture.test/${first.id}`);

    const updated = await updateExternalCalendarEvent({
      ...request,
      externalEventId: first.id,
      startAt: new Date("2026-08-20T11:00:00.000Z"),
      endAt: new Date("2026-08-20T12:00:00.000Z"),
    });
    expect(updated).toEqual(first);
  });

  it("uses the explicitly selected conflict calendar in fixture mode", async () => {
    const busyConnection = { ...baseConnection, id: "00000000-0000-0000-0000-000000000004", providerAccountEmail: "fixture-busy@example.com" };
    const from = new Date("2026-08-20T09:00:00.000Z");
    const to = new Date("2026-08-20T10:00:00.000Z");

    await expect(listBusyForConnection(busyConnection, from, to, ["fixture-team"])).resolves.toEqual([{ startAt: from, endAt: to }]);
  });

  it("requests a Google invitation and polls the generated Meet entry point", async () => {
    process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE = "0";
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "test-client";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "test-secret";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    const connection = {
      ...baseConnection,
      accessTokenEncrypted: encrypt("test-access-token"),
      tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
    };
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "google-event-1", htmlLink: "https://calendar.google.com/event-1", conferenceData: { entryPoints: [] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "google-event-1", conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/test-room" }] } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createExternalCalendarEvent({
      connection,
      calendarId: "target-calendar",
      idempotencyKey: "booking-456",
      title: "Appel stratégique",
      description: "Description",
      startAt: new Date("2026-08-20T09:00:00.000Z"),
      endAt: new Date("2026-08-20T10:00:00.000Z"),
      guestName: "Prospect Test",
      guestEmail: "prospect@example.com",
      meetingUrl: null,
    });

    expect(result).toEqual({ id: "google-event-1", url: "https://calendar.google.com/event-1", meetingUrl: "https://meet.google.com/test-room" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(requestUrl)).toContain("calendars/target-calendar/events");
    expect(String(requestUrl)).toContain("sendUpdates=all");
    expect(String(requestUrl)).toContain("conferenceDataVersion=1");
    const body = JSON.parse(String(requestInit?.body)) as { attendees?: Array<{ email: string }>; conferenceData?: { createRequest?: { requestId?: string; conferenceSolutionKey?: { type?: string } } } };
    expect(body.attendees).toEqual([{ email: "prospect@example.com", displayName: "Prospect Test" }]);
    expect(body.conferenceData?.createRequest).toMatchObject({
      requestId: "meet-booking456",
      conferenceSolutionKey: { type: "hangoutsMeet" },
    });
  });
});
