import type { CalendarConnection } from "./calendar";

type CalendarConnectionStatus = Pick<CalendarConnection, "provider" | "status">;

export type CalendarConfigurationReason = "missing_target" | "missing_conflict" | "calendar_unavailable";

export type CalendarConfigurationReadiness = {
  ready: boolean;
  invitationConnection: CalendarConnectionStatus | null;
  invitationCalendarId: string | null;
  conflictCalendars: Array<{ connection: CalendarConnectionStatus; calendarId: string }>;
};

export function isCalendarTemporarilyUnavailable(reason: CalendarConfigurationReason | null | undefined): boolean {
  return reason === "calendar_unavailable";
}

export function isCalendarConfigurationComplete(state: CalendarConfigurationReadiness): boolean {
  const hasConnectedGoogleCalendar =
    state.invitationConnection?.provider === "google" && state.invitationConnection.status === "connected";
  const hasInvitationCalendar = Boolean(state.invitationCalendarId?.trim());
  const hasConflictCalendar = state.conflictCalendars.some(
    ({ connection, calendarId }) =>
      connection.provider === "google" && connection.status === "connected" && Boolean(calendarId.trim())
  );

  return state.ready && Boolean(hasConnectedGoogleCalendar && hasInvitationCalendar && hasConflictCalendar);
}
