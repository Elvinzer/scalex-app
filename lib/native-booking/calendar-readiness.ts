import type { CalendarConnection } from "./calendar";

type CalendarConnectionStatus = Pick<CalendarConnection, "provider" | "status">;

export type CalendarConfigurationReadiness = {
  ready: boolean;
  invitationConnection: CalendarConnectionStatus | null;
  invitationCalendarId: string | null;
  conflictCalendars: Array<{ connection: CalendarConnectionStatus; calendarId: string }>;
};

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
