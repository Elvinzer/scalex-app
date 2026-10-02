import { sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: { select: vi.fn() }, where: vi.fn() }));

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("./calendar", () => ({ listBusyForConnection: vi.fn() }));
vi.mock("./settings", () => ({ getCalendarStatesForClosers: vi.fn() }));
vi.mock("@/lib/booking-page/queries", () => ({ getBookingPageSettingsView: vi.fn() }));

import { listNativeBookingLeads } from "./leads";
import { getNativeBookingEvent, getNativeBookingEventDetail, listNativeBookingEvents, listUpcomingNativeBookings } from "./queries";
import type { NativeBookingViewer } from "./access";

const accountId = "00000000-0000-4000-8000-000000000001";
const closerA = "00000000-0000-4000-8000-000000000002";
const closerB = "00000000-0000-4000-8000-000000000003";
const eventId = "00000000-0000-4000-8000-000000000004";

function viewer(userId: string, isAccountWide: boolean): NativeBookingViewer {
  return { userId, accountId, isAccountWide };
}

function queryBuilder(rows: unknown[] = []) {
  let whereCondition: SQL | undefined;
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: (condition: SQL) => {
      whereCondition = condition;
      mocks.where(condition);
      return builder;
    },
    orderBy: () => builder,
    limit: async () => rows,
    getSQL: () => whereCondition ? sql`select 1 where ${whereCondition}` : sql`select 1`,
  };
  return builder;
}

function compiledWhere(index: number) {
  return new PgDialect().sqlToQuery(mocks.where.mock.calls[index]?.[0] as SQL);
}

describe("native booking loader scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.select.mockImplementation(() => queryBuilder());
  });

  it("limits a delegated closer's event lookup to their assignment", async () => {
    await expect(getNativeBookingEvent(accountId, eventId, viewer(closerA, false))).resolves.toBeNull();

    expect(mocks.db.select).toHaveBeenCalledTimes(2);
    const assignment = compiledWhere(0);
    const event = compiledWhere(1);
    expect(assignment.sql).toContain("closer_user_id");
    expect(assignment.params).toContain(closerA);
    expect(assignment.params).not.toContain(closerB);
    expect(event.params).toEqual(expect.arrayContaining([accountId, eventId, closerA]));
  });

  it("does not load event detail or links when the event is outside a delegated closer's scope", async () => {
    await expect(getNativeBookingEventDetail(accountId, eventId, viewer(closerA, false))).resolves.toBeNull();

    // The outer event query and its assignment subquery are the only reads.
    expect(mocks.db.select).toHaveBeenCalledTimes(2);
  });

  it("keeps event listings account-wide for an owner", async () => {
    await listNativeBookingEvents(accountId, viewer(accountId, true));

    expect(mocks.db.select).toHaveBeenCalledOnce();
    const event = compiledWhere(0);
    expect(event.params).toContain(accountId);
    expect(event.params).not.toContain(closerA);
    expect(event.params).not.toContain(closerB);
  });

  it("uses closer B's own identity when B opens an event", async () => {
    await expect(getNativeBookingEvent(accountId, eventId, viewer(closerB, false))).resolves.toBeNull();

    const assignment = compiledWhere(0);
    const event = compiledWhere(1);
    expect(assignment.params).toContain(closerB);
    expect(assignment.params).not.toContain(closerA);
    expect(event.params).toContain(closerB);
    expect(event.params).not.toContain(closerA);
  });

  it("scopes booking lead search to the delegated closer's assigned events", async () => {
    await listNativeBookingLeads(accountId, viewer(closerA, false));

    expect(mocks.db.select).toHaveBeenCalledTimes(2);
    const assignment = compiledWhere(0);
    const leads = compiledWhere(1);
    expect(assignment.params).toContain(closerA);
    expect(assignment.params).not.toContain(closerB);
    expect(leads.params).toContain(accountId);
    expect(leads.params).toContain(closerA);
    expect(leads.params).not.toContain(closerB);
  });

  it("scopes upcoming booking rows to the delegated closer", async () => {
    await listUpcomingNativeBookings(accountId, new Date("2026-10-01T00:00:00.000Z"), viewer(closerA, false));

    expect(mocks.db.select).toHaveBeenCalledOnce();
    const bookings = compiledWhere(0);
    expect(bookings.params).toContain(accountId);
    expect(bookings.params).toContain(closerA);
    expect(bookings.params).not.toContain(closerB);
  });
});
