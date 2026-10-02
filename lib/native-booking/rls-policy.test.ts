import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  nativeBookingEventClosers,
  nativeBookingEvents,
  nativeBookingCalendarConflicts,
  nativeBookingCalendarSettings,
  nativeBookingLeads,
  nativeBookingLinks,
  nativeBookings,
  nativeCalendarConnections,
} from "@/db/schema";

const calendarTables = [
  ["events", nativeBookingEvents, "native_booking_events_account_access", "native_booking_event_viewer", []],
  ["event assignments", nativeBookingEventClosers, "native_booking_event_closers_event_access", "native_booking_event_viewer", ["auth.uid()", "closer_user_id"]],
  ["links", nativeBookingLinks, "native_booking_links_account_access", "native_booking_event_viewer", []],
  ["booking leads", nativeBookingLeads, "native_booking_leads_account_access", "native_booking_event_viewer", []],
  ["bookings", nativeBookings, "native_bookings_account_access", "native_booking_event_viewer", ["auth.uid()"]],
  ["calendar connections", nativeCalendarConnections, "native_calendar_connections_account_access", "native_booking_account_member", ["auth.uid()", "closer_user_id"]],
  ["calendar settings", nativeBookingCalendarSettings, "native_booking_calendar_settings_account_access", "native_booking_account_member", ["auth.uid()", "closer_user_id"]],
  ["calendar conflicts", nativeBookingCalendarConflicts, "native_booking_calendar_conflicts_account_access", "native_booking_account_member", ["auth.uid()", "closer_user_id"]],
] as const;

describe("native booking RLS configuration", () => {
  it.each(calendarTables)("enables authenticated account-and-closer access for %s", (_label, table, policyName, scopeFunction, directScopeFragments) => {
    const config = getTableConfig(table);
    expect(config.enableRLS).toBe(true);

    const policy = config.policies.find((candidate) => candidate.name === policyName);
    expect(policy).toBeDefined();
    expect(policy?.for).toBe("all");
    expect(policy?.to).toBe("authenticated");
    expect(policy?.using).toBeDefined();
    expect(policy?.withCheck).toBeDefined();

    const dialect = new PgDialect();
    const using = dialect.sqlToQuery(policy!.using!);
    const withCheck = dialect.sqlToQuery(policy!.withCheck!);
    for (const condition of [using.sql, withCheck.sql]) {
      expect(condition).toContain(scopeFunction);
      for (const fragment of directScopeFragments) expect(condition).toContain(fragment);
    }
    if (table === nativeBookingCalendarSettings || table === nativeBookingCalendarConflicts) {
      expect(using.sql).toContain("native_calendar_connections");
      expect(withCheck.sql).toContain("native_calendar_connections");
    }
  });
});
