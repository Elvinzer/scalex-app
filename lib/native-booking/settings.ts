import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  nativeBookingCalendarConflicts,
  nativeBookingCalendarSettings,
  nativeCalendarConnections,
} from "@/db/schema";

import {
  listCalendarsForConnection,
  type CalendarConnection,
  type CalendarOption,
} from "./calendar";

export type CalendarConflictSelection = {
  connectionId: string;
  calendarId: string;
};

export type CalendarConfigurationState = {
  closerUserId: string;
  invitationConnection: CalendarConnection | null;
  invitationCalendarId: string | null;
  conflictCalendars: Array<{ connection: CalendarConnection; calendarId: string }>;
  ready: boolean;
  unavailable: boolean;
  reason: "missing_target" | "missing_conflict" | "calendar_unavailable" | null;
};

export type CalendarSettingsConnectionView = {
  id: string;
  provider: "google" | "outlook";
  email: string | null;
  status: "connected" | "reconnect_required" | "revoked";
  calendars: CalendarOption[];
  loadError: boolean;
};

export type CalendarSettingsView = {
  connections: CalendarSettingsConnectionView[];
  invitationConnectionId: string | null;
  invitationCalendarId: string | null;
  conflicts: CalendarConflictSelection[];
  ready: boolean;
  reason: CalendarConfigurationState["reason"];
};

type CalendarLookup = {
  connection: CalendarConnection;
  calendars: CalendarOption[];
  loadError: boolean;
};

async function loadCalendarLookups(connections: CalendarConnection[]): Promise<Map<string, CalendarLookup>> {
  const lookups = await Promise.all(
    connections.map(async (connection): Promise<CalendarLookup> => {
      if (connection.status !== "connected") return { connection, calendars: [], loadError: false };
      try {
        return { connection, calendars: await listCalendarsForConnection(connection), loadError: false };
      } catch {
        return { connection, calendars: [], loadError: true };
      }
    })
  );
  return new Map(lookups.map((lookup) => [lookup.connection.id, lookup]));
}

async function loadGoogleSettingsRows(accountId: string, closerUserIds: string[]) {
  if (closerUserIds.length === 0) {
    return { connections: [], settings: [], conflicts: [] };
  }

  const [connections, settings, conflicts] = await Promise.all([
    db
      .select()
      .from(nativeCalendarConnections)
      .where(
        and(
          eq(nativeCalendarConnections.userId, accountId),
          inArray(nativeCalendarConnections.closerUserId, closerUserIds),
          eq(nativeCalendarConnections.provider, "google")
        )
      )
      .orderBy(asc(nativeCalendarConnections.closerUserId), asc(nativeCalendarConnections.createdAt)),
    db
      .select()
      .from(nativeBookingCalendarSettings)
      .where(
        and(
          eq(nativeBookingCalendarSettings.userId, accountId),
          inArray(nativeBookingCalendarSettings.closerUserId, closerUserIds)
        )
      ),
    db
      .select()
      .from(nativeBookingCalendarConflicts)
      .where(
        and(
          eq(nativeBookingCalendarConflicts.userId, accountId),
          inArray(nativeBookingCalendarConflicts.closerUserId, closerUserIds)
        )
      ),
  ]);

  return { connections, settings, conflicts };
}

export async function getCalendarStatesForClosers(accountId: string, closerUserIds: string[]) {
  const states = new Map<string, CalendarConfigurationState>();
  if (closerUserIds.length === 0) return states;

  const { connections, settings, conflicts } = await loadGoogleSettingsRows(accountId, closerUserIds);
  const lookups = await loadCalendarLookups(connections);

  for (const closerUserId of closerUserIds) {
    const closerConnections = connections.filter((connection) => connection.closerUserId === closerUserId);
    const configuration = settings.find((row) => row.closerUserId === closerUserId);
    const invitationConnection = configuration?.invitationConnectionId
      ? closerConnections.find((connection) => connection.id === configuration.invitationConnectionId) ?? null
      : null;
    const closerConflicts = conflicts
      .filter((row) => row.closerUserId === closerUserId)
      .flatMap((row) => {
        const connection = closerConnections.find((candidate) => candidate.id === row.connectionId);
        const lookup = connection ? lookups.get(connection.id) : undefined;
        if (!connection || connection.status !== "connected" || !lookup || lookup.loadError || !lookup.calendars.some((calendar) => calendar.id === row.calendarId)) {
          return [];
        }
        return [{ connection, calendarId: row.calendarId }];
      });

    const targetLookup = invitationConnection ? lookups.get(invitationConnection.id) : undefined;
    const targetCalendar = targetLookup?.calendars.find((calendar) => calendar.id === configuration?.invitationCalendarId);
    const configuredConflictRows = conflicts.filter((row) => row.closerUserId === closerUserId);
    const relevantConnectionIds = new Set([
      ...(invitationConnection ? [invitationConnection.id] : []),
      ...configuredConflictRows.map(({ connectionId }) => connectionId),
    ]);
    const lookupFailed = Array.from(relevantConnectionIds).some((connectionId) => lookups.get(connectionId)?.loadError === true);
    const targetReady = Boolean(
      invitationConnection &&
        invitationConnection.status === "connected" &&
        configuration?.invitationCalendarId &&
        targetLookup &&
        !targetLookup.loadError &&
        targetCalendar?.canWrite
    );
    const conflictReady = configuredConflictRows.length > 0 && closerConflicts.length === configuredConflictRows.length;
    const targetConfigured = Boolean(invitationConnection && configuration?.invitationCalendarId);
    const reason: CalendarConfigurationState["reason"] = lookupFailed
      ? "calendar_unavailable"
      : !targetConfigured || !targetReady
        ? "missing_target"
        : !conflictReady
          ? "missing_conflict"
          : null;

    states.set(closerUserId, {
      closerUserId,
      invitationConnection: targetReady ? invitationConnection : null,
      invitationCalendarId: targetReady ? configuration?.invitationCalendarId ?? null : null,
      conflictCalendars: closerConflicts,
      ready: targetReady && conflictReady && !lookupFailed,
      unavailable: !(targetReady && conflictReady && !lookupFailed),
      reason,
    });
  }

  return states;
}

export async function getCalendarSettingsView(accountId: string, closerUserId: string): Promise<CalendarSettingsView> {
  const { connections, settings, conflicts } = await loadGoogleSettingsRows(accountId, [closerUserId]);
  const lookups = await loadCalendarLookups(connections);
  const configuration = settings[0] ?? null;
  const selectedConflicts = conflicts.map(({ connectionId, calendarId }) => ({ connectionId, calendarId }));
  const state = (await getCalendarStatesForClosers(accountId, [closerUserId])).get(closerUserId);

  return {
    connections: Array.from(lookups.values()).map(({ connection, calendars, loadError }) => ({
      id: connection.id,
      provider: connection.provider,
      email: connection.providerAccountEmail,
      status: connection.status,
      calendars,
      loadError,
    })),
    invitationConnectionId: configuration?.invitationConnectionId ?? null,
    invitationCalendarId: configuration?.invitationCalendarId ?? null,
    conflicts: selectedConflicts,
    ready: state?.ready ?? false,
    reason: state?.reason ?? "missing_target",
  };
}

export async function getOwnedCalendarConnections(accountId: string, closerUserId: string) {
  return db
    .select()
    .from(nativeCalendarConnections)
    .where(and(eq(nativeCalendarConnections.userId, accountId), eq(nativeCalendarConnections.closerUserId, closerUserId)))
    .orderBy(asc(nativeCalendarConnections.provider), asc(nativeCalendarConnections.createdAt));
}
