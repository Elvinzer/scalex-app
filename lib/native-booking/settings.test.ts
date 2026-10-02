import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import type { CalendarConnection, CalendarOption } from "./calendar";
import {
  resolveCalendarState,
  type CalendarConflictRow,
  type CalendarLookup,
  type CalendarSettingsRow,
} from "./settings";

const accountId = "00000000-0000-4000-8000-000000000001";
const closerA = "00000000-0000-4000-8000-000000000002";
const closerB = "00000000-0000-4000-8000-000000000003";
const connectionAId = "00000000-0000-4000-8000-000000000004";
const connectionBId = "00000000-0000-4000-8000-000000000005";
const invitationConnectionId = "00000000-0000-4000-8000-000000000006";
const createdAt = new Date("2026-01-01T00:00:00.000Z");

function connection(id: string, closerUserId: string): CalendarConnection {
  return {
    id,
    userId: accountId,
    closerUserId,
    provider: "google",
    providerAccountSubject: `subject-${id}`,
    providerAccountEmail: `${id}@example.test`,
    accessTokenEncrypted: "encrypted-access-token",
    refreshTokenEncrypted: "encrypted-refresh-token",
    tokenExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
    selectedCalendarIds: ["primary"],
    status: "connected",
    lastError: null,
    createdAt,
    updatedAt: createdAt,
  };
}

function settingsRow(overrides: Partial<CalendarSettingsRow> = {}): CalendarSettingsRow {
  return {
    id: "00000000-0000-4000-8000-000000000007",
    userId: accountId,
    closerUserId: closerA,
    invitationConnectionId: connectionAId,
    invitationCalendarId: "primary-a-snapshot",
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function conflictRow(connectionId: string, id: string): CalendarConflictRow {
  return { id, userId: accountId, closerUserId: closerA, connectionId, calendarId: `snapshot-${connectionId}`, createdAt };
}

function lookup(connectionValue: CalendarConnection, primaryCalendar: CalendarOption | null, loadError = false): CalendarLookup {
  return { connection: connectionValue, primaryCalendar, loadError };
}

describe("native booking calendar configuration resolver", () => {
  it("selects one writable invitation target and every selected account's primary conflict calendar", () => {
    const target = connection(connectionAId, closerA);
    const firstConflict = connection(connectionBId, closerA);
    const secondConflict = connection(invitationConnectionId, closerA);
    const primaryA = { id: "primary-a-current", name: "Primary A", isPrimary: true, canWrite: true };
    const primaryB = { id: "primary-b-current", name: "Primary B", isPrimary: true, canWrite: true };
    const primaryC = { id: "primary-c-current", name: "Primary C", isPrimary: true, canWrite: true };

    const state = resolveCalendarState({
      closerUserId: closerA,
      closerConnections: [target, firstConflict, secondConflict],
      configuration: settingsRow({ invitationConnectionId: target.id }),
      conflictRows: [conflictRow(firstConflict.id, "00000000-0000-4000-8000-000000000008"), conflictRow(secondConflict.id, "00000000-0000-4000-8000-000000000009")],
      lookups: new Map([
        [target.id, lookup(target, primaryA)],
        [firstConflict.id, lookup(firstConflict, primaryB)],
        [secondConflict.id, lookup(secondConflict, primaryC)],
      ]),
    });

    expect(state.ready).toBe(true);
    expect(state.invitationConnection?.id).toBe(target.id);
    expect(state.invitationCalendarId).toBe(primaryA.id);
    expect(state.conflictCalendars.map(({ calendarId }) => calendarId)).toEqual([primaryB.id, primaryC.id]);
  });

  it("does not resolve a target owned by another closer", () => {
    const targetOwnedByCloserB = connection(invitationConnectionId, closerB);
    const conflict = connection(connectionBId, closerA);
    const state = resolveCalendarState({
      closerUserId: closerA,
      closerConnections: [conflict],
      configuration: settingsRow({ invitationConnectionId: targetOwnedByCloserB.id }),
      conflictRows: [conflictRow(conflict.id, "00000000-0000-4000-8000-000000000010")],
      lookups: new Map([[conflict.id, lookup(conflict, { id: "primary-b", name: "Primary B", isPrimary: true, canWrite: true })]]),
    });

    expect(state).toMatchObject({ ready: false, invitationConnection: null, reason: "missing_target" });
  });

  it("distinguishes a missing conflict selection from a temporarily unreadable selected calendar", () => {
    const target = connection(connectionAId, closerA);
    const targetCalendar = { id: "primary-a", name: "Primary A", isPrimary: true, canWrite: true };
    const missingConflict = resolveCalendarState({
      closerUserId: closerA,
      closerConnections: [target],
      configuration: settingsRow(),
      conflictRows: [],
      lookups: new Map([[target.id, lookup(target, targetCalendar)]]),
    });
    expect(missingConflict).toMatchObject({ ready: false, reason: "missing_conflict" });

    const selectedConflict = connection(connectionBId, closerA);
    const unavailableConflict = resolveCalendarState({
      closerUserId: closerA,
      closerConnections: [target, selectedConflict],
      configuration: settingsRow(),
      conflictRows: [conflictRow(selectedConflict.id, "00000000-0000-4000-8000-000000000011")],
      lookups: new Map([
        [target.id, lookup(target, targetCalendar)],
        [selectedConflict.id, lookup(selectedConflict, null, true)],
      ]),
    });
    expect(unavailableConflict).toMatchObject({ ready: false, unavailable: true, reason: "calendar_unavailable" });
  });
});
