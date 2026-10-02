import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), insert: vi.fn(), update: vi.fn(), delete: vi.fn() },
  requireUserId: vi.fn(),
  requirePermission: vi.fn(),
  getNativeBookingViewer: vi.fn(),
  getNativeBookingEvent: vi.fn(),
  getNativeBookingEventDetail: vi.fn(),
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

import { toggleNativeBookingEventAction, toggleNativeBookingLinkAction } from "./actions";

const accountId = "00000000-0000-4000-8000-000000000001";
const closerA = "00000000-0000-4000-8000-000000000002";
const eventId = "00000000-0000-4000-8000-000000000003";
const linkId = "00000000-0000-4000-8000-000000000004";

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
});
