import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn(), transaction: vi.fn() },
  requireUserId: vi.fn(),
  requirePermission: vi.fn(),
  getNativeBookingViewer: vi.fn(),
  getNativeBookingEvent: vi.fn(),
  getNativeBookingEventDetail: vi.fn(),
  entitlements: vi.fn(),
  canCreate: vi.fn(),
  ensureHandle: vi.fn(),
}));

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/lib/current-user", () => ({ requireUserId: mocks.requireUserId }));
vi.mock("@/lib/team/context", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/native-booking/access", () => ({ getNativeBookingViewer: mocks.getNativeBookingViewer }));
vi.mock("@/lib/native-booking/queries", () => ({
  getNativeBookingEvent: mocks.getNativeBookingEvent,
  getNativeBookingEventDetail: mocks.getNativeBookingEventDetail,
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/billing/plan-gate", () => ({ getNativeBookingEntitlements: mocks.entitlements, canCreateNativeBookingEvent: mocks.canCreate }));
vi.mock("@/lib/native-booking/handle", async (original) => ({ ...await original<typeof import("@/lib/native-booking/handle")>(), ensureAccountBookingHandle: mocks.ensureHandle }));

import { createNativeBookingEventAction, toggleNativeBookingEventAction, toggleNativeBookingLinkAction } from "./actions";
import { businesses, nativeBookingEventClosers, nativeBookingEvents } from "@/db/schema";

const accountId = "00000000-0000-4000-8000-000000000001";
const closerA = "00000000-0000-4000-8000-000000000002";
const eventId = "00000000-0000-4000-8000-000000000003";
const linkId = "00000000-0000-4000-8000-000000000004";
const ownerUserId = "00000000-0000-4000-8000-000000000005";

function selectRows(rows: unknown[]) { return { from: () => ({ where: () => ({ limit: async () => rows }) }) }; }

describe("native booking management mutation scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserId.mockResolvedValue(closerA);
    mocks.requirePermission.mockResolvedValue({ accountId });
  });

  it("blocks a delegated closer from changing an event state", async () => {
    mocks.getNativeBookingViewer.mockResolvedValue({ userId: closerA, accountId, isAccountWide: false });

    await expect(toggleNativeBookingEventAction(eventId, "paused")).resolves.toEqual({ error: "booking_management_forbidden" });

    expect(mocks.db.update).not.toHaveBeenCalled();
    expect(mocks.db.select).not.toHaveBeenCalled();
  });

  it("does not change a link when its event is outside the owner's account scope", async () => {
    mocks.getNativeBookingViewer.mockResolvedValue({ userId: accountId, accountId, isAccountWide: true });
    mocks.getNativeBookingEvent.mockResolvedValue(null);

    await expect(toggleNativeBookingLinkAction({ eventId, linkId, isActive: false })).resolves.toEqual({ error: "Événement introuvable." });

    expect(mocks.getNativeBookingEvent).toHaveBeenCalledWith(accountId, eventId, { userId: accountId, accountId, isAccountWide: true });
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it("does not activate an event that the owner cannot load in their account", async () => {
    mocks.getNativeBookingViewer.mockResolvedValue({ userId: accountId, accountId, isAccountWide: true });
    mocks.getNativeBookingEventDetail.mockResolvedValue(null);

    await expect(toggleNativeBookingEventAction(eventId, "active")).resolves.toEqual({ error: "Événement introuvable." });

    expect(mocks.getNativeBookingEventDetail).toHaveBeenCalledWith(accountId, eventId, { userId: accountId, accountId, isAccountWide: true });
    expect(mocks.db.update).not.toHaveBeenCalled();
  });

  it("assigns the personal owner as default closer when creating an independent business event", async () => {
    mocks.getNativeBookingViewer.mockResolvedValue({ userId: closerA, accountId, isAccountWide: true });
    mocks.canCreate.mockResolvedValue({ allowed: true });
    mocks.db.select.mockReturnValue(selectRows([]));
    const values: Array<{ table: unknown; data: unknown }> = [];
    const tx = {
      select: vi.fn(() => selectRows([{ ownerUserId }])),
      insert: vi.fn((table) => ({ values: (data: unknown) => { values.push({ table, data }); return { returning: async () => [{ id: eventId }] }; } })),
    };
    mocks.db.transaction.mockImplementation(async (run) => run(tx));
    const response = await createNativeBookingEventAction({ name: "Test event", slug: "test-event", durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, minNoticeMinutes: 0, bookingHorizonDays: 30, timeZone: "Europe/Paris", meetingLabel: "Test call", meetingUrl: null, publicHeading: "Book a call", publicDescription: "", requireContactBeforeSlots: false, roundRobinEnabled: false });
    expect(response).toEqual({ error: null, eventId });
    expect(values.find((row) => row.table === nativeBookingEvents)?.data).toMatchObject({ userId: accountId });
    expect(values.find((row) => row.table === nativeBookingEventClosers)?.data).toEqual({ eventId, closerUserId: ownerUserId, position: 0 });
    expect(tx.select).toHaveBeenCalledWith({ ownerUserId: businesses.ownerUserId });
  });

  it("restores the personal owner as default closer on activation even when a manager activates it", async () => {
    mocks.getNativeBookingViewer.mockResolvedValue({ userId: closerA, accountId, isAccountWide: true });
    mocks.getNativeBookingEventDetail.mockResolvedValue({ event: { id: eventId }, availability: [{}], closers: [] });
    mocks.entitlements.mockResolvedValue({ enabled: true });
    mocks.db.select.mockReturnValue(selectRows([{ ownerUserId }]));
    const insertValues = vi.fn(() => ({ onConflictDoUpdate: vi.fn() }));
    mocks.db.insert.mockReturnValue({ values: insertValues });
    mocks.db.update.mockReturnValue({ set: () => ({ where: vi.fn() }) });
    expect(await toggleNativeBookingEventAction(eventId, "active")).toEqual({ error: null });
    expect(insertValues).toHaveBeenCalledWith({ eventId, closerUserId: ownerUserId, position: 0 });
  });
});
