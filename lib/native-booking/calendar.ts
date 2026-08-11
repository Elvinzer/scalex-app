import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { nativeCalendarConnections, nativeCalendarProvider } from "@/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { requireEnv } from "@/lib/utils";

export type CalendarProvider = typeof nativeCalendarProvider.enumValues[number];
export type CalendarConnection = typeof nativeCalendarConnections.$inferSelect;

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";
const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const MICROSOFT_API_BASE = "https://graph.microsoft.com/v1.0";

export const NATIVE_CALENDAR_SCOPES = {
  google: ["openid", "email", "https://www.googleapis.com/auth/calendar.readonly", "https://www.googleapis.com/auth/calendar.events"],
  outlook: ["openid", "email", "offline_access", "Calendars.ReadWrite"],
} as const;

export type BusyPeriod = { startAt: Date; endAt: Date };
export type ExternalCalendarEvent = { id: string; url: string | null; meetingUrl: string | null };
export type CalendarOption = { id: string; name: string; isPrimary: boolean; canWrite: boolean };

const BUSY_CACHE_TTL_MS = 15_000;
const busyCache = new Map<string, { expiresAt: number; periods: BusyPeriod[] }>();
const testExternalEvents = new Map<string, { connectionId: string; title: string; startAt: Date; endAt: Date; meetingUrl: string | null }>();

function isCalendarTestMode() {
  return process.env.NODE_ENV !== "production" && process.env.NATIVE_BOOKING_CALENDAR_TEST_MODE === "1";
}

function isTestFailure(connection: CalendarConnection) {
  return connection.providerAccountEmail?.toLowerCase().includes("fixture-fail") ?? false;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isGoogleMeetUrl(value: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "meet.google.com" || url.hostname.endsWith(".meet.google.com"));
  } catch {
    return false;
  }
}

function parseProviderDate(value: string): Date {
  return new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
}

async function requestJson(url: string, init: RequestInit): Promise<{ status: number; body: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  } finally {
    clearTimeout(timer);
  }
}

function tokenConfig(provider: CalendarProvider) {
  if (provider === "google") {
    return {
      clientId: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      clientSecret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      tokenUrl: GOOGLE_TOKEN_URL,
    };
  }
  return {
    clientId: requireEnv("MICROSOFT_CALENDAR_CLIENT_ID"),
    clientSecret: requireEnv("MICROSOFT_CALENDAR_CLIENT_SECRET"),
    tokenUrl: MICROSOFT_TOKEN_URL,
  };
}

export function calendarAuthorizeUrl(provider: CalendarProvider, redirectUri: string, state: string): string {
  const config = tokenConfig(provider);
  const authorizeUrl = new URL(provider === "google" ? "https://accounts.google.com/o/oauth2/v2/auth" : "https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", NATIVE_CALENDAR_SCOPES[provider].join(" "));
  authorizeUrl.searchParams.set("state", state);
  if (provider === "google") {
    authorizeUrl.searchParams.set("access_type", "offline");
    authorizeUrl.searchParams.set("prompt", "select_account consent");
  }
  return authorizeUrl.toString();
}

export async function exchangeCalendarCode(provider: CalendarProvider, code: string, redirectUri: string) {
  const config = tokenConfig(provider);
  const response = await requestJson(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      ...(provider === "outlook" ? { scope: NATIVE_CALENDAR_SCOPES.outlook.join(" ") } : {}),
    }),
  });
  const body = asRecord(response.body);
  const accessToken = stringValue(body.access_token);
  const refreshToken = stringValue(body.refresh_token);
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  if (response.status < 200 || response.status >= 300 || !accessToken) throw new Error(`Calendar OAuth exchange failed (${response.status})`);
  return { accessToken, refreshToken, expiresInSeconds: expiresIn };
}

async function refreshCalendarToken(provider: CalendarProvider, refreshToken: string) {
  const config = tokenConfig(provider);
  const response = await requestJson(config.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      ...(provider === "outlook" ? { scope: NATIVE_CALENDAR_SCOPES.outlook.join(" ") } : {}),
    }),
  });
  const body = asRecord(response.body);
  const accessToken = stringValue(body.access_token);
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  if (response.status < 200 || response.status >= 300 || !accessToken) throw new Error(`Calendar token refresh failed (${response.status})`);
  return { accessToken, refreshToken: stringValue(body.refresh_token) ?? refreshToken, expiresInSeconds: expiresIn };
}

async function getAccessToken(connection: CalendarConnection): Promise<{ connection: CalendarConnection; accessToken: string }> {
  if (isCalendarTestMode()) return { connection, accessToken: "native-booking-calendar-fixture" };
  if (!connection.accessTokenEncrypted) throw new Error("Calendar connection has no access token");
  if (connection.tokenExpiresAt && connection.tokenExpiresAt.getTime() > Date.now() + 60_000) {
    return { connection, accessToken: decrypt(connection.accessTokenEncrypted) };
  }
  if (!connection.refreshTokenEncrypted) {
    await db
      .update(nativeCalendarConnections)
      .set({ status: "reconnect_required", lastError: "Le calendrier doit être reconnecté.", updatedAt: new Date() })
      .where(eq(nativeCalendarConnections.id, connection.id));
    throw new Error("Calendar connection needs to be reconnected");
  }

  let refreshed: Awaited<ReturnType<typeof refreshCalendarToken>>;
  try {
    refreshed = await refreshCalendarToken(connection.provider, decrypt(connection.refreshTokenEncrypted));
  } catch (error) {
    await db
      .update(nativeCalendarConnections)
      .set({ status: "reconnect_required", lastError: "La reconnexion du calendrier a échoué.", updatedAt: new Date() })
      .where(eq(nativeCalendarConnections.id, connection.id));
    throw error;
  }
  const [updated] = await db
    .update(nativeCalendarConnections)
    .set({
      accessTokenEncrypted: encrypt(refreshed.accessToken),
      refreshTokenEncrypted: encrypt(refreshed.refreshToken),
      tokenExpiresAt: new Date(Date.now() + refreshed.expiresInSeconds * 1000),
      status: "connected",
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(nativeCalendarConnections.id, connection.id))
    .returning();
  return { connection: updated ?? connection, accessToken: refreshed.accessToken };
}

export async function getCalendarConnection(accountId: string, closerUserId: string, provider: CalendarProvider) {
  const [connection] = await db
    .select()
    .from(nativeCalendarConnections)
    .where(
      and(
        eq(nativeCalendarConnections.userId, accountId),
        eq(nativeCalendarConnections.closerUserId, closerUserId),
        eq(nativeCalendarConnections.provider, provider)
      )
    )
    .limit(1);
  return connection ?? null;
}

export async function getCalendarAccountIdentity(accessToken: string, provider: CalendarProvider): Promise<{ subject: string | null; email: string | null }> {
  if (provider === "google") {
    const response = await requestJson(GOOGLE_USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (response.status < 200 || response.status >= 300) throw new Error(`Google account identity failed (${response.status})`);
    const body = asRecord(response.body);
    return { subject: stringValue(body.sub), email: stringValue(body.email) };
  }
  const response = await requestJson(`${MICROSOFT_API_BASE}/me?$select=mail,userPrincipalName`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (response.status < 200 || response.status >= 300) throw new Error(`Outlook account identity failed (${response.status})`);
  const body = asRecord(response.body);
  return { subject: stringValue(body.id), email: stringValue(body.mail) ?? stringValue(body.userPrincipalName) };
}

export async function getCalendarAccountEmail(accessToken: string, provider: CalendarProvider): Promise<string | null> {
  return (await getCalendarAccountIdentity(accessToken, provider)).email;
}

export async function listCalendarsForConnection(connection: CalendarConnection): Promise<CalendarOption[]> {
  if (isCalendarTestMode()) {
    if (isTestFailure(connection)) throw new Error("Calendar fixture unavailable");
    return [
      { id: "fixture-primary", name: "Agenda fixture principale", isPrimary: true, canWrite: true },
      { id: "fixture-team", name: "Agenda fixture équipe", isPrimary: false, canWrite: true },
    ];
  }
  const { accessToken } = await getAccessToken(connection);
  if (connection.provider === "google") {
    const response = await requestJson(`${GOOGLE_API_BASE}/users/me/calendarList?minAccessRole=reader`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`Google calendar list failed (${response.status})`);
    const items = asRecord(response.body).items;
    const calendars = Array.isArray(items)
      ? items.flatMap((item) => {
          const row = asRecord(item);
          const id = stringValue(row.id);
          if (!id) return [];
          const accessRole = stringValue(row.accessRole);
          return [{
            id,
            name: stringValue(row.summary) ?? id,
            isPrimary: row.primary === true,
            canWrite: accessRole === "owner" || accessRole === "writer" || accessRole === "fileOrganizer",
          }];
        })
      : [];
    return calendars.length > 0 ? calendars : [{ id: "primary", name: "Agenda principale", isPrimary: true, canWrite: true }];
  }

  const response = await requestJson(`${MICROSOFT_API_BASE}/me/calendars?$select=id,name,isDefaultCalendar`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (response.status < 200 || response.status >= 300) throw new Error(`Outlook calendar list failed (${response.status})`);
  const values = asRecord(response.body).value;
  const calendars = Array.isArray(values)
    ? values.flatMap((item) => {
        const row = asRecord(item);
        const id = stringValue(row.id);
        if (!id) return [];
        return [{ id, name: stringValue(row.name) ?? id, isPrimary: row.isDefaultCalendar === true, canWrite: row.canEdit !== false }];
      })
    : [];
  return calendars.length > 0 ? calendars : [{ id: "primary", name: "Agenda principale", isPrimary: true, canWrite: true }];
}

export async function listBusyForConnection(connection: CalendarConnection, from: Date, to: Date, calendarIds?: string[]): Promise<BusyPeriod[]> {
  const selectedCalendarIds = calendarIds?.length ? calendarIds : connection.selectedCalendarIds;
  const cacheKey = [connection.id, connection.provider, selectedCalendarIds.join(","), from.toISOString(), to.toISOString()].join("|");
  const cached = busyCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.periods;
  if (cached) busyCache.delete(cacheKey);

  if (isCalendarTestMode()) {
    if (isTestFailure(connection)) throw new Error("Calendar fixture unavailable");
    const periods = connection.providerAccountEmail?.toLowerCase().includes("fixture-busy") ? [{ startAt: from, endAt: to }] : [];
    busyCache.set(cacheKey, { expiresAt: Date.now() + BUSY_CACHE_TTL_MS, periods });
    return periods;
  }

  const { accessToken } = await getAccessToken(connection);
  let periods: BusyPeriod[];
  if (connection.provider === "google") {
    const ids = selectedCalendarIds.length > 0 ? selectedCalendarIds : ["primary"];
    const response = await requestJson(`${GOOGLE_API_BASE}/freeBusy`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({ timeMin: from.toISOString(), timeMax: to.toISOString(), items: ids.map((id) => ({ id })) }),
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`Google free/busy failed (${response.status})`);
    const calendars = asRecord(asRecord(response.body).calendars);
    periods = Object.values(calendars).flatMap((value) => {
      const busy = asRecord(value).busy;
      return Array.isArray(busy)
        ? busy.flatMap((period) => {
            const row = asRecord(period);
            const start = stringValue(row.start);
            const end = stringValue(row.end);
            return start && end ? [{ startAt: new Date(start), endAt: new Date(end) }] : [];
          })
        : [];
    });
  } else if (selectedCalendarIds.some((calendarId) => calendarId !== "primary")) {
    const calendarIds = selectedCalendarIds.filter((calendarId) => calendarId !== "primary");
    const calendarPeriods = await Promise.all(
      calendarIds.map(async (calendarId) => {
        const periods: BusyPeriod[] = [];
        let nextUrl: string | null = null;
        let page = 0;

        do {
          const url = nextUrl ?? `${MICROSOFT_API_BASE}/me/calendars/${encodeURIComponent(calendarId)}/calendarView?${new URLSearchParams({
            startDateTime: from.toISOString(),
            endDateTime: to.toISOString(),
            "$select": "start,end,showAs,isCancelled",
            "$top": "1000",
          }).toString()}`;
          const response = await requestJson(url, {
            headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC"' },
          });
          if (response.status < 200 || response.status >= 300) throw new Error(`Outlook calendar view failed (${response.status})`);
          const body = asRecord(response.body);
          const values = body.value;
          if (Array.isArray(values)) {
            for (const value of values) {
              const row = asRecord(value);
              if (row.isCancelled === true || row.showAs === "free") continue;
              const start = stringValue(asRecord(row.start).dateTime);
              const end = stringValue(asRecord(row.end).dateTime);
              if (start && end) periods.push({ startAt: parseProviderDate(start), endAt: parseProviderDate(end) });
            }
          }
          nextUrl = stringValue(body["@odata.nextLink"]);
          page += 1;
        } while (nextUrl && page < 10);

        return periods;
      })
    );
    periods = calendarPeriods.flat();
  } else {
    const schedule = connection.providerAccountEmail ?? "me";
    const response = await requestJson(`${MICROSOFT_API_BASE}/me/calendar/getSchedule`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json", Prefer: 'outlook.timezone="UTC"' },
      body: JSON.stringify({
        schedules: [schedule],
        startTime: { dateTime: from.toISOString(), timeZone: "UTC" },
        endTime: { dateTime: to.toISOString(), timeZone: "UTC" },
        availabilityViewInterval: 15,
      }),
    });
    if (response.status < 200 || response.status >= 300) throw new Error(`Outlook free/busy failed (${response.status})`);
    const values = asRecord(response.body).value;
    const firstSchedule = Array.isArray(values) ? asRecord(values[0]) : {};
    const scheduleItems = firstSchedule.scheduleItems;
    periods = Array.isArray(scheduleItems)
      ? scheduleItems.flatMap((period) => {
          const row = asRecord(period);
          const start = stringValue(asRecord(row.start).dateTime);
          const end = stringValue(asRecord(row.end).dateTime);
          return start && end ? [{ startAt: parseProviderDate(start), endAt: parseProviderDate(end) }] : [];
        })
      : [];
  }
  busyCache.set(cacheKey, { expiresAt: Date.now() + BUSY_CACHE_TTL_MS, periods });
  if (busyCache.size > 200) {
    const oldestKey = busyCache.keys().next().value;
    if (oldestKey) busyCache.delete(oldestKey);
  }
  return periods;
}

function extractGoogleMeetingUrl(body: Record<string, unknown>): string | null {
  const entryPoints = asRecord(body.conferenceData).entryPoints;
  if (!Array.isArray(entryPoints)) return null;
  for (const entryPoint of entryPoints) {
    const row = asRecord(entryPoint);
    if (row.entryPointType === "video") {
      const uri = stringValue(row.uri);
      if (uri) return uri;
    }
  }
  return null;
}

async function waitForGoogleMeeting(
  accessToken: string,
  calendarId: string,
  eventId: string,
  initialBody: Record<string, unknown>
): Promise<string | null> {
  const immediate = extractGoogleMeetingUrl(initialBody);
  if (immediate) return immediate;

  for (const delayMs of [250, 500, 1_000, 2_000]) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    const response = await requestJson(
      `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (response.status < 200 || response.status >= 300) continue;
    const meetingUrl = extractGoogleMeetingUrl(asRecord(response.body));
    if (meetingUrl) return meetingUrl;
  }
  return null;
}

export async function createExternalCalendarEvent({
  connection,
  calendarId,
  idempotencyKey,
  title,
  description,
  startAt,
  endAt,
  guestName,
  guestEmail,
  meetingUrl,
}: {
  connection: CalendarConnection;
  calendarId?: string | null;
  idempotencyKey: string;
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  guestName: string;
  guestEmail: string | null;
  meetingUrl: string | null;
}): Promise<ExternalCalendarEvent> {
  if (isCalendarTestMode()) {
    if (isTestFailure(connection)) throw new Error("Calendar fixture create failed");
    const id = `fixture-${idempotencyKey.replace(/[^a-z0-9]/gi, "").toLowerCase()}`;
    const generatedMeetingUrl = `https://meet.fixture.test/${id}`;
    testExternalEvents.set(id, { connectionId: connection.id, title, startAt, endAt, meetingUrl: generatedMeetingUrl });
    return { id, url: `https://calendar.fixture.test/event/${id}`, meetingUrl: generatedMeetingUrl };
  }
  const { accessToken } = await getAccessToken(connection);
  if (connection.provider === "google") {
    const targetCalendarId = calendarId ?? connection.selectedCalendarIds[0] ?? "primary";
    const deterministicEventId = idempotencyKey.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 100);
    const conferenceRequestId = `meet-${idempotencyKey.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 90)}`;
    const eventUrl = new URL(`${GOOGLE_API_BASE}/calendars/${encodeURIComponent(targetCalendarId)}/events`);
    eventUrl.searchParams.set("sendUpdates", "all");
    eventUrl.searchParams.set("conferenceDataVersion", "1");
    if (deterministicEventId.length >= 5) eventUrl.searchParams.set("id", deterministicEventId);
    const response = await requestJson(eventUrl.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        summary: title,
        description: [description, meetingUrl ? `Lien : ${meetingUrl}` : ""].filter(Boolean).join("\n\n"),
        start: { dateTime: startAt.toISOString() },
        end: { dateTime: endAt.toISOString() },
        conferenceData: {
          createRequest: {
            requestId: conferenceRequestId,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
        ...(guestEmail ? { attendees: [{ email: guestEmail, displayName: guestName }] } : {}),
      }),
    });
    let body = asRecord(response.body);
    let id = stringValue(body.id);
    let recoveredExisting = false;
    if (response.status === 409 && deterministicEventId.length >= 5) {
      const existing = await requestJson(
        `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(targetCalendarId)}/events/${encodeURIComponent(deterministicEventId)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (existing.status >= 200 && existing.status < 300) {
        body = asRecord(existing.body);
        id = stringValue(body.id) ?? deterministicEventId;
        recoveredExisting = true;
      }
    }
    if ((response.status < 200 || response.status >= 300) && !recoveredExisting) {
      throw new Error(`Google event creation failed (${response.status})`);
    }
    if (!id) throw new Error(`Google event creation failed (${response.status})`);
    const generatedMeetingUrl = await waitForGoogleMeeting(accessToken, targetCalendarId, id, body);
    return { id, url: stringValue(body.htmlLink), meetingUrl: generatedMeetingUrl };
  }

  const response = await requestJson(`${MICROSOFT_API_BASE}/me/events`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      subject: title,
      body: { contentType: "text", content: [description, meetingUrl ? `Lien : ${meetingUrl}` : ""].filter(Boolean).join("\n\n") },
      start: { dateTime: startAt.toISOString(), timeZone: "UTC" },
      end: { dateTime: endAt.toISOString(), timeZone: "UTC" },
      ...(guestEmail ? { attendees: [{ emailAddress: { address: guestEmail, name: guestName }, type: "required" }] } : {}),
      transactionId: idempotencyKey,
      isReminderOn: true,
      reminderMinutesBeforeStart: 30,
    }),
  });
  const body = asRecord(response.body);
  const id = stringValue(body.id);
  if (response.status < 200 || response.status >= 300 || !id) throw new Error(`Outlook event creation failed (${response.status})`);
  return { id, url: stringValue(body.webLink), meetingUrl: null };
}

export async function cancelExternalCalendarEvent(connection: CalendarConnection, externalEventId: string, calendarId?: string | null): Promise<void> {
  if (isCalendarTestMode()) {
    if (isTestFailure(connection)) throw new Error("Calendar fixture cancellation failed");
    testExternalEvents.delete(externalEventId);
    return;
  }
  const { accessToken } = await getAccessToken(connection);
  const url = connection.provider === "google"
    ? `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(calendarId ?? connection.selectedCalendarIds[0] ?? "primary")}/events/${encodeURIComponent(externalEventId)}`
    : `${MICROSOFT_API_BASE}/me/events/${encodeURIComponent(externalEventId)}`;
  const response = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  if (response.status !== 204 && (response.status < 200 || response.status >= 300)) throw new Error(`Calendar event cancellation failed (${response.status})`);
}

export async function updateExternalCalendarEvent({
  connection,
  calendarId,
  externalEventId,
  title,
  description,
  startAt,
  endAt,
  guestName,
  guestEmail,
  meetingUrl,
}: {
  connection: CalendarConnection;
  calendarId?: string | null;
  externalEventId: string;
  title: string;
  description: string;
  startAt: Date;
  endAt: Date;
  guestName: string;
  guestEmail: string | null;
  meetingUrl: string | null;
}): Promise<ExternalCalendarEvent> {
  if (isCalendarTestMode()) {
    if (isTestFailure(connection)) throw new Error("Calendar fixture update failed");
    const existing = testExternalEvents.get(externalEventId);
    const existingMeetingUrl = existing?.meetingUrl ?? meetingUrl;
    if (existing) testExternalEvents.set(externalEventId, { ...existing, title, startAt, endAt, meetingUrl: existingMeetingUrl });
    return { id: externalEventId, url: `https://calendar.fixture.test/event/${externalEventId}`, meetingUrl: existingMeetingUrl };
  }
  const { accessToken } = await getAccessToken(connection);
  const body = connection.provider === "google"
    ? {
        summary: title,
        description: [description, meetingUrl ? `Lien : ${meetingUrl}` : ""].filter(Boolean).join("\n\n"),
        start: { dateTime: startAt.toISOString(), timeZone: "UTC" },
        end: { dateTime: endAt.toISOString(), timeZone: "UTC" },
        ...(guestEmail ? { attendees: [{ email: guestEmail, displayName: guestName }] } : {}),
      }
    : {
        subject: title,
        body: { contentType: "text", content: [description, meetingUrl ? `Lien : ${meetingUrl}` : ""].filter(Boolean).join("\n\n") },
        start: { dateTime: startAt.toISOString(), timeZone: "UTC" },
        end: { dateTime: endAt.toISOString(), timeZone: "UTC" },
        ...(guestEmail ? { attendees: [{ emailAddress: { address: guestEmail, name: guestName }, type: "required" }] } : {}),
      };
  const targetCalendarId = calendarId ?? connection.selectedCalendarIds[0] ?? "primary";
  const url = connection.provider === "google"
    ? `${GOOGLE_API_BASE}/calendars/${encodeURIComponent(targetCalendarId)}/events/${encodeURIComponent(externalEventId)}`
    : `${MICROSOFT_API_BASE}/me/events/${encodeURIComponent(externalEventId)}`;
  const response = await requestJson(url, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const responseBody = asRecord(response.body);
  const id = stringValue(responseBody.id) ?? externalEventId;
  if (response.status < 200 || response.status >= 300) throw new Error(`Calendar event update failed (${response.status})`);
  const externalMeetingUrl = connection.provider === "google" ? await waitForGoogleMeeting(accessToken, targetCalendarId, id, responseBody) : null;
  return { id, url: stringValue(responseBody.htmlLink) ?? stringValue(responseBody.webLink), meetingUrl: externalMeetingUrl ?? (isGoogleMeetUrl(meetingUrl) ? meetingUrl : null) };
}
