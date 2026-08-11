import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import {
  nativeBookingCalendarConflicts,
  nativeBookingCalendarSettings,
  nativeCalendarConnections,
} from "@/db/schema";

import {
  getPrimaryCalendarOption,
  listCalendarsForConnection,
  type CalendarConnection,
  type CalendarOption,
} from "./calendar";

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
  primaryCalendar: CalendarOption | null;
  loadError: boolean;
};

export type CalendarSettingsView = {
  connections: CalendarSettingsConnectionView[];
  invitationConnectionId: string | null;
  conflicts: string[];
  ready: boolean;
  reason: CalendarConfigurationState["reason"];
};

type CalendarSettingsRow = typeof nativeBookingCalendarSettings.$inferSelect;
type CalendarConflictRow = typeof nativeBookingCalendarConflicts.$inferSelect;

type CalendarLookup = {
  connection: CalendarConnection;
  primaryCalendar: CalendarOption | null;
  loadError: boolean;
};

async function loadCalendarLookups(connections: CalendarConnection[]): Promise<Map<string, CalendarLookup>> {
  const lookups = await Promise.all(
    connections.map(async (connection): Promise<CalendarLookup> => {
      if (connection.status !== "connected") return { connection, primaryCalendar: null, loadError: false };
      try {
        const calendars = await listCalendarsForConnection(connection);
        return { connection, primaryCalendar: getPrimaryCalendarOption(calendars), loadError: false };
      } catch {
        return { connection, primaryCalendar: null, loadError: true };
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

function resolveCalendarState({
  closerUserId,
  closerConnections,
  configuration,
  conflictRows,
  lookups,
}: {
  closerUserId: string;
  closerConnections: CalendarConnection[];
  configuration: CalendarSettingsRow | undefined;
  conflictRows: CalendarConflictRow[];
  lookups: Map<string, CalendarLookup>;
}): CalendarConfigurationState {
  const invitationConnection = configuration?.invitationConnectionId
    ? closerConnections.find((connection) => connection.id === configuration.invitationConnectionId) ?? null
    : null;
  const configuredConflictConnectionIds = Array.from(new Set(conflictRows.map(({ connectionId }) => connectionId)));
  const conflictCalendars = configuredConflictConnectionIds.flatMap((connectionId) => {
    const connection = closerConnections.find((candidate) => candidate.id === connectionId);
    const lookup = connection ? lookups.get(connection.id) : undefined;
    const primaryCalendar = lookup?.primaryCalendar;
    if (!connection || connection.status !== "connected" || !lookup || lookup.loadError || !primaryCalendar) return [];
    return [{ connection, calendarId: primaryCalendar.id }];
  });

  const targetLookup = invitationConnection ? lookups.get(invitationConnection.id) : undefined;
  const targetCalendar = targetLookup?.primaryCalendar;
  const relevantConnectionIds = Array.from(
    new Set([
      ...(configuration?.invitationConnectionId ? [configuration.invitationConnectionId] : []),
      ...configuredConflictConnectionIds,
    ])
  );
  const calendarUnavailable = relevantConnectionIds.some((connectionId) => {
    const lookup = lookups.get(connectionId);
    return lookup?.loadError === true || (lookup !== undefined && lookup.primaryCalendar === null);
  });
  const targetReady = Boolean(
    invitationConnection &&
      invitationConnection.status === "connected" &&
      targetLookup &&
      !targetLookup.loadError &&
      targetCalendar?.canWrite
  );
  const conflictReady = configuredConflictConnectionIds.length > 0 && conflictCalendars.length === configuredConflictConnectionIds.length;
  const targetConfigured = Boolean(configuration?.invitationConnectionId && invitationConnection);
  const reason: CalendarConfigurationState["reason"] = calendarUnavailable
    ? "calendar_unavailable"
    : !targetConfigured || !targetReady
      ? "missing_target"
      : !conflictReady
        ? "missing_conflict"
        : null;

  return {
    closerUserId,
    invitationConnection: targetReady ? invitationConnection : null,
    invitationCalendarId: targetReady ? targetCalendar?.id ?? null : null,
    conflictCalendars,
    ready: targetReady && conflictReady && !calendarUnavailable,
    unavailable: !(targetReady && conflictReady && !calendarUnavailable),
    reason,
  };
}

export async function getCalendarStatesForClosers(accountId: string, closerUserIds: string[]) {
  const states = new Map<string, CalendarConfigurationState>();
  if (closerUserIds.length === 0) return states;

  const { connections, settings, conflicts } = await loadGoogleSettingsRows(accountId, closerUserIds);
  const lookups = await loadCalendarLookups(connections);

  for (const closerUserId of closerUserIds) {
    states.set(
      closerUserId,
      resolveCalendarState({
        closerUserId,
        closerConnections: connections.filter((connection) => connection.closerUserId === closerUserId),
        configuration: settings.find((row) => row.closerUserId === closerUserId),
        conflictRows: conflicts.filter((row) => row.closerUserId === closerUserId),
        lookups,
      })
    );
  }

  return states;
}

export async function getCalendarSettingsView(accountId: string, closerUserId: string): Promise<CalendarSettingsView> {
  const { connections, settings, conflicts } = await loadGoogleSettingsRows(accountId, [closerUserId]);
  const lookups = await loadCalendarLookups(connections);
  const configuration = settings.find((row) => row.closerUserId === closerUserId);
  const closerConflicts = conflicts.filter((row) => row.closerUserId === closerUserId);
  const state = resolveCalendarState({
    closerUserId,
    closerConnections: connections,
    configuration,
    conflictRows: closerConflicts,
    lookups,
  });

  return {
    connections: Array.from(lookups.values()).map(({ connection, primaryCalendar, loadError }) => ({
      id: connection.id,
      provider: connection.provider,
      email: connection.providerAccountEmail,
      status: connection.status,
      primaryCalendar,
      loadError,
    })),
    invitationConnectionId: configuration?.invitationConnectionId ?? null,
    conflicts: Array.from(new Set(closerConflicts.map(({ connectionId }) => connectionId))),
    ready: state.ready,
    reason: state.reason,
  };
}

export async function getOwnedCalendarConnections(accountId: string, closerUserId: string) {
  return db
    .select()
    .from(nativeCalendarConnections)
    .where(and(eq(nativeCalendarConnections.userId, accountId), eq(nativeCalendarConnections.closerUserId, closerUserId)))
    .orderBy(asc(nativeCalendarConnections.provider), asc(nativeCalendarConnections.createdAt));
}
