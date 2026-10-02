import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: { select: vi.fn() }, where: vi.fn() }));

vi.mock("@/db", () => ({ db: mocks.db }));

import { getNativeBookingRescheduleSlotsForAccount, listUnifiedAgendaAppointments } from "./agenda";
import type { NativeBookingViewer } from "./access";

const accountId = "00000000-0000-4000-8000-000000000001";
const closerA = "00000000-0000-4000-8000-000000000002";
const closerB = "00000000-0000-4000-8000-000000000003";
const bookingId = "00000000-0000-4000-8000-000000000004";

function emptyQueryBuilder() {
  const builder = {
    from: () => builder,
    innerJoin: () => builder,
    leftJoin: () => builder,
    where: (condition: unknown) => {
      mocks.where(condition);
      return builder;
    },
    orderBy: async () => [],
    limit: async () => [],
  };
  return builder;
}

function viewer(userId: string, isAccountWide: boolean): NativeBookingViewer {
  return { userId, accountId, isAccountWide };
}

describe("native booking agenda query scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.select.mockImplementation(() => emptyQueryBuilder());
  });

  it("forces a delegated closer to their own external call rows despite another requested filter", async () => {
    await listUnifiedAgendaAppointments(accountId, viewer(closerA, false), {
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-10-08T00:00:00.000Z"),
      sources: ["calendly"],
      closerIds: [closerB],
      statuses: ["confirmed"],
    });

    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]?.[0]);
    expect(query.sql).toContain("user_id");
    expect(query.sql).toContain("closer_user_id");
    expect(query.params).toContain(accountId);
    expect(query.params).toContain(closerA);
    expect(query.params).not.toContain(closerB);
  });

  it("preserves owner-selected closer filters while keeping the account boundary", async () => {
    await listUnifiedAgendaAppointments(accountId, viewer(closerA, true), {
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-10-08T00:00:00.000Z"),
      sources: ["iclosed"],
      closerIds: [closerA, closerB],
      statuses: ["confirmed"],
    });

    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]?.[0]);
    expect(query.params).toEqual(expect.arrayContaining([accountId, closerA, closerB]));
  });

  it("scopes reschedule slot lookup to both the account and the current closer", async () => {
    await expect(getNativeBookingRescheduleSlotsForAccount(accountId, bookingId, viewer(closerA, false))).resolves.toBeNull();

    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]?.[0]);
    expect(query.sql).toContain("user_id");
    expect(query.sql).toContain("closer_user_id");
    expect(query.params).toEqual(expect.arrayContaining([accountId, bookingId, closerA]));
    expect(query.params).not.toContain(closerB);
  });
});
