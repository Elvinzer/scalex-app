import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const mocks = vi.hoisted(() => ({ select: vi.fn(), send: vi.fn(), entitlement: vi.fn(), where: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/businesses/entitlements", () => ({ getBusinessEntitlement: mocks.entitlement }));
vi.mock("./client", () => ({ inngest: { send: mocks.send }, nativeBookingCalendarSyncRequested: { create: (data: unknown) => ({ name: "calendar", data }) }, nativeBookingNotificationRequested: { create: (data: unknown) => ({ name: "notification", data }) }, nativeBookingReminderRequested: { create: (data: unknown) => ({ name: "reminder", data }) } }));

import { resumeBusinessOperations } from "./business-recovery";

const businessId = "00000000-0000-4000-8000-000000000011";
const updatedAt = new Date("2026-01-01T00:00:00Z");

function rows(value: unknown[]) {
  const builder = { from: () => builder, innerJoin: () => builder, where: (condition: SQL) => { mocks.where(condition); return builder; }, orderBy: () => builder, limit: async () => value };
  return builder;
}

beforeEach(() => { vi.clearAllMocks(); mocks.entitlement.mockResolvedValue({ active: true }); mocks.send.mockResolvedValue({ ids: [] }); });

describe("business recovery outbox", () => {
  it("does not read or enqueue outbound operations for an inactive business", async () => {
    mocks.entitlement.mockResolvedValue({ active: false });
    await resumeBusinessOperations(businessId);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("replays pending rows with stable event IDs and business filters", async () => {
    const queue = () => {
      const notification = rows([{ id: "notification-id", bookingId: "booking-id", kind: "confirmation", updatedAt }]);
      const empty = rows([]);
      mocks.select.mockReturnValueOnce(notification).mockReturnValueOnce(empty).mockReturnValueOnce(empty).mockReturnValueOnce(empty);
    };
    queue(); await resumeBusinessOperations(businessId);
    const first = mocks.send.mock.calls[0]?.[0];
    queue(); await resumeBusinessOperations(businessId);
    expect(mocks.send.mock.calls[1]?.[0]).toEqual(first);
    expect(first).toEqual([{ name: "notification", data: { bookingId: "booking-id", kind: "confirmation" }, id: `business-recovery:notification:notification-id:${updatedAt.getTime()}` }]);
    for (const [condition] of mocks.where.mock.calls) {
      const scope = new PgDialect().sqlToQuery(condition);
      expect(scope.params).toContain(businessId);
    }
  });

  it("propagates enqueue failures so the payment webhook can retry its durable rows", async () => {
    mocks.select.mockReturnValue(rows([{ id: "notification-id", bookingId: "booking-id", kind: "confirmation", updatedAt }]));
    mocks.send.mockRejectedValue(new Error("queue unavailable"));
    await expect(resumeBusinessOperations(businessId)).rejects.toThrow("queue unavailable");
  });
});
