import { describe, expect, it } from "vitest";

import { isCalendarConfigurationComplete, type CalendarConfigurationReadiness } from "./calendar-readiness";

const connection = {
  provider: "google" as const,
  status: "connected" as const,
};

function state(overrides: Partial<CalendarConfigurationReadiness> = {}): CalendarConfigurationReadiness {
  return {
    ready: true,
    invitationConnection: connection,
    invitationCalendarId: "primary",
    conflictCalendars: [{ connection, calendarId: "primary" }],
    ...overrides,
  };
}

describe("isCalendarConfigurationComplete", () => {
  it("accepts one connected Google calendar with invitation and conflict calendars", () => {
    expect(isCalendarConfigurationComplete(state())).toBe(true);
  });

  const incompleteStates: Array<[string, Partial<CalendarConfigurationReadiness>]> = [
    ["no connected Google calendar", { invitationConnection: null }],
    ["no invitation calendar", { invitationCalendarId: "" }],
    ["no conflict calendar", { conflictCalendars: [] }],
    ["server state is not ready", { ready: false }],
  ];

  it.each(incompleteStates)("rejects an incomplete setup: %s", (_label, overrides) => {
    expect(isCalendarConfigurationComplete(state(overrides))).toBe(false);
  });
});
