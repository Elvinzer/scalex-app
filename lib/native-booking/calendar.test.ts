import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMocks = vi.hoisted(() => ({ update: vi.fn(), set: vi.fn(), where: vi.fn() }));

vi.mock("@/db", () => ({ db: { update: dbMocks.update } }));

import {
  createExternalCalendarEvent,
  cancelExternalCalendarEvent,
  getCalendarAccountIdentity,
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

const originalEnvironment = {
  calendarTestMode: process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE,
  googleClientId: process.env.GOOGLE_CALENDAR_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
  encryptionKey: process.env.ENCRYPTION_KEY,
};

function restoreEnvironmentValue(key: string, value: string | undefined) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe("native booking calendar adapter", () => {
  beforeEach(() => {
    process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE = "1";
    dbMocks.update.mockReset().mockReturnValue({ set: dbMocks.set });
    dbMocks.set.mockReset().mockReturnValue({ where: dbMocks.where });
    dbMocks.where.mockReset().mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    restoreEnvironmentValue("NATIVE_BOOKING_CALENDAR_TEST_MODE", originalEnvironment.calendarTestMode);
    restoreEnvironmentValue("GOOGLE_CALENDAR_CLIENT_ID", originalEnvironment.googleClientId);
    restoreEnvironmentValue("GOOGLE_CALENDAR_CLIENT_SECRET", originalEnvironment.googleClientSecret);
    restoreEnvironmentValue("ENCRYPTION_KEY", originalEnvironment.encryptionKey);
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

  it("uses Google's stable subject as the account identity", async () => {
    process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE = "0";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ sub: "google-sub-123", email: "closer@example.test" }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getCalendarAccountIdentity("fixture-access-token", "google")).resolves.toEqual({
      subject: "google-sub-123",
      email: "closer@example.test",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://www.googleapis.com/oauth2/v3/userinfo",
      expect.objectContaining({ headers: { Authorization: "Bearer fixture-access-token" } })
    );
  });

  it("recovers the same Google event after a duplicate create and returns its existing Meet URL", async () => {
    process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE = "0";
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "fixture-client";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "fixture-secret";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    const connection = {
      ...baseConnection,
      accessTokenEncrypted: encrypt("fixture-access-token"),
      tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "duplicate" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "bookingrepeat",
        htmlLink: "https://calendar.google.com/event/bookingrepeat",
        conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/existing-room" }] },
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createExternalCalendarEvent({
      connection,
      calendarId: "target-calendar",
      idempotencyKey: "booking-repeat",
      title: "Fixture booking",
      description: "Fixture description",
      startAt: new Date("2026-08-20T09:00:00.000Z"),
      endAt: new Date("2026-08-20T10:00:00.000Z"),
      guestName: "Test guest",
      guestEmail: null,
      meetingUrl: null,
    });

    expect(result).toEqual({
      id: "bookingrepeat",
      url: "https://calendar.google.com/event/bookingrepeat",
      meetingUrl: "https://meet.google.com/existing-room",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain("/events/bookingrepeat");
  });

  it("returns a pending Meet result when Google has not generated a conference within the bounded poll", async () => {
    process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE = "0";
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "fixture-client";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "fixture-secret";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    vi.useFakeTimers();
    const connection = {
      ...baseConnection,
      accessTokenEncrypted: encrypt("fixture-access-token"),
      tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "google-event-pending", htmlLink: "https://calendar.google.com/event/pending", conferenceData: { entryPoints: [] } }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const resultPromise = createExternalCalendarEvent({
      connection,
      calendarId: "target-calendar",
      idempotencyKey: "booking-pending",
      title: "Fixture booking",
      description: "Fixture description",
      startAt: new Date("2026-08-20T09:00:00.000Z"),
      endAt: new Date("2026-08-20T10:00:00.000Z"),
      guestName: "Test guest",
      guestEmail: null,
      meetingUrl: null,
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.meetingUrl).toBeNull();
    expect(result.id).toBe("google-event-pending");
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("marks a connection for reconnection when its expired token has no refresh token", async () => {
    process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE = "0";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    const connection = {
      ...baseConnection,
      accessTokenEncrypted: encrypt("expired-access-token"),
      refreshTokenEncrypted: null,
      tokenExpiresAt: new Date(Date.now() - 60_000),
    };

    await expect(listCalendarsForConnection(connection)).rejects.toThrow("Calendar connection needs to be reconnected");
    expect(dbMocks.set).toHaveBeenCalledWith(expect.objectContaining({ status: "reconnect_required" }));
    expect(dbMocks.where).toHaveBeenCalledOnce();
  });

  it("marks a revoked provider refresh token as reconnect-required", async () => {
    process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE = "0";
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "fixture-client";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "fixture-secret";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    const connection = {
      ...baseConnection,
      accessTokenEncrypted: encrypt("expired-access-token"),
      refreshTokenEncrypted: encrypt("revoked-refresh-token"),
      tokenExpiresAt: new Date(Date.now() - 60_000),
    };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listCalendarsForConnection(connection)).rejects.toThrow("Calendar token refresh failed (400)");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(dbMocks.set).toHaveBeenCalledWith(expect.objectContaining({ status: "reconnect_required" }));
  });

  it("moves and cancels the same Google event in its configured calendar", async () => {
    process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE = "0";
    process.env.GOOGLE_CALENDAR_CLIENT_ID = "fixture-client";
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET = "fixture-secret";
    process.env.ENCRYPTION_KEY = Buffer.alloc(32).toString("base64");
    const connection = {
      ...baseConnection,
      accessTokenEncrypted: encrypt("fixture-access-token"),
      tokenExpiresAt: new Date(Date.now() + 10 * 60_000),
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "google-event-to-move",
        htmlLink: "https://calendar.google.com/event/moved",
        conferenceData: { entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/stable-room" }] },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const moved = await updateExternalCalendarEvent({
      connection,
      calendarId: "target-calendar",
      externalEventId: "google-event-to-move",
      title: "Moved fixture booking",
      description: "Updated description",
      startAt: new Date("2026-08-20T11:00:00.000Z"),
      endAt: new Date("2026-08-20T12:00:00.000Z"),
      guestName: "Test guest",
      guestEmail: "guest@example.test",
      meetingUrl: "https://meet.google.com/stable-room",
    });

    expect(moved).toEqual({
      id: "google-event-to-move",
      url: "https://calendar.google.com/event/moved",
      meetingUrl: "https://meet.google.com/stable-room",
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://www.googleapis.com/calendar/v3/calendars/target-calendar/events/google-event-to-move");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "PATCH" });
    const patchBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as { start?: { dateTime?: string }; end?: { dateTime?: string } };
    expect(patchBody).toMatchObject({
      start: { dateTime: "2026-08-20T11:00:00.000Z" },
      end: { dateTime: "2026-08-20T12:00:00.000Z" },
    });

    await cancelExternalCalendarEvent(connection, moved.id, "target-calendar");
    expect(fetchMock.mock.calls[1]?.[0]).toBe("https://www.googleapis.com/calendar/v3/calendars/target-calendar/events/google-event-to-move");
    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({ method: "DELETE" });
  });
});
