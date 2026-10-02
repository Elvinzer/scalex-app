import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), transaction: vi.fn(), update: vi.fn(), delete: vi.fn(), insert: vi.fn() },
  where: vi.fn(),
  requireUserId: vi.fn(),
  requirePermission: vi.fn(),
  listCalendarsForConnection: vi.fn(),
  getPrimaryCalendarOption: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/lib/current-user", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/team/context", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/native-booking/calendar", () => ({
  listCalendarsForConnection: mocks.listCalendarsForConnection,
  getPrimaryCalendarOption: mocks.getPrimaryCalendarOption,
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));

import { disconnectNativeBookingCalendarAction, saveNativeBookingCalendarSettingsAction } from "./actions";

const accountId = "00000000-0000-4000-8000-000000000001";
const closerA = "00000000-0000-4000-8000-000000000002";
const foreignConnectionId = "00000000-0000-4000-8000-000000000003";
const targetConnectionId = "00000000-0000-4000-8000-000000000004";
const conflictConnectionId = "00000000-0000-4000-8000-000000000005";

function makeConnection(id: string) {
  return { id, provider: "google", status: "connected" };
}

function queryReturning(rows: unknown[]) {
  return {
    from: () => ({
      where: (condition: unknown) => {
        mocks.where(condition);
        return Promise.resolve(rows);
      },
    }),
  };
}

describe("calendar settings server action authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue(closerA);
    mocks.requirePermission.mockResolvedValue({ accountId });
  });

  it("rejects a user without booking permission before reading connection records", async () => {
    mocks.requirePermission.mockResolvedValue(null);

    await expect(saveNativeBookingCalendarSettingsAction({ invitationConnectionId: foreignConnectionId, conflictConnectionIds: [] }))
      .resolves.toEqual({ error: "calendar_settings_forbidden" });

    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it("cannot select another closer's calendar as the invitation target", async () => {
    mocks.db.select.mockReturnValue(queryReturning([]));

    await expect(saveNativeBookingCalendarSettingsAction({ invitationConnectionId: foreignConnectionId, conflictConnectionIds: [] }))
      .resolves.toEqual({ error: "calendar_target_unavailable" });

    const scopeQuery = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]?.[0]);
    expect(scopeQuery.sql).toContain("user_id");
    expect(scopeQuery.sql).toContain("closer_user_id");
    expect(scopeQuery.params).toEqual(expect.arrayContaining([accountId, closerA, foreignConnectionId]));
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it("cannot disconnect a connection outside the current account and closer scope", async () => {
    mocks.db.select.mockReturnValue({
      from: () => ({
        where: (condition: unknown) => {
          mocks.where(condition);
          return { limit: async () => [] };
        },
      }),
    });

    await expect(disconnectNativeBookingCalendarAction({ connectionId: foreignConnectionId }))
      .resolves.toEqual({ error: "calendar_connection_not_found" });

    const scopeQuery = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]?.[0]);
    expect(scopeQuery.sql).toContain("user_id");
    expect(scopeQuery.sql).toContain("closer_user_id");
    expect(scopeQuery.params).toEqual(expect.arrayContaining([accountId, closerA, foreignConnectionId]));
    expect(mocks.db.transaction).not.toHaveBeenCalled();
  });

  it("saves a changed invitation target and the selected primary conflict calendars", async () => {
    const targetConnection = makeConnection(targetConnectionId);
    const conflictConnection = makeConnection(conflictConnectionId);
    mocks.db.select.mockReturnValue(queryReturning([targetConnection, conflictConnection]));
    mocks.listCalendarsForConnection.mockImplementation(async (connection: { id: string }) => [
      { id: `primary-${connection.id}`, name: "Primary", isPrimary: true, canWrite: true },
    ]);
    mocks.getPrimaryCalendarOption.mockImplementation((calendars: Array<{ id: string; name: string; isPrimary: boolean; canWrite: boolean }>) =>
      calendars.find((calendar) => calendar.isPrimary) ?? null
    );

    const transaction = {
      select: vi.fn(() => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "settings-row" }] }) }) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
      insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
    };
    mocks.db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction));

    await expect(saveNativeBookingCalendarSettingsAction({
      invitationConnectionId: targetConnectionId,
      conflictConnectionIds: [conflictConnectionId],
    })).resolves.toEqual({ error: null });

    expect(transaction.update).toHaveBeenCalledOnce();
    expect(transaction.update.mock.results[0]?.value.set).toHaveBeenCalledWith(expect.objectContaining({
      userId: accountId,
      closerUserId: closerA,
      invitationConnectionId: targetConnectionId,
      invitationCalendarId: `primary-${targetConnectionId}`,
    }));
    expect(transaction.delete).toHaveBeenCalledOnce();
    expect(transaction.insert.mock.results[0]?.value.values).toHaveBeenCalledWith([
      expect.objectContaining({
        userId: accountId,
        closerUserId: closerA,
        connectionId: conflictConnectionId,
        calendarId: `primary-${conflictConnectionId}`,
      }),
    ]);
  });

  it("revokes only the current closer's connection and clears its target and conflicts", async () => {
    mocks.db.select.mockReturnValue({
      from: () => ({
        where: (condition: unknown) => {
          mocks.where(condition);
          return { limit: async () => [{ id: targetConnectionId }] };
        },
      }),
    });
    const transaction = {
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })) })),
      delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
    };
    mocks.db.transaction.mockImplementation(async (callback: (tx: typeof transaction) => Promise<void>) => callback(transaction));

    await expect(disconnectNativeBookingCalendarAction({ connectionId: targetConnectionId })).resolves.toEqual({ error: null });

    expect(transaction.update).toHaveBeenCalledTimes(2);
    expect(transaction.update.mock.results[0]?.value.set).toHaveBeenCalledWith(expect.objectContaining({
      status: "revoked",
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      tokenExpiresAt: null,
    }));
    expect(transaction.update.mock.results[1]?.value.set).toHaveBeenCalledWith(expect.objectContaining({
      invitationConnectionId: null,
      invitationCalendarId: null,
    }));
    expect(transaction.delete).toHaveBeenCalledOnce();
    const scopeQuery = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]?.[0]);
    expect(scopeQuery.params).toEqual(expect.arrayContaining([accountId, closerA, targetConnectionId]));
  });
});
