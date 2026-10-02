import { NextRequest } from "next/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: { select: vi.fn(), update: vi.fn(), insert: vi.fn(), where: vi.fn() },
  getClaims: vi.fn(),
  requirePermission: vi.fn(),
  exchangeCalendarCode: vi.fn(),
  getCalendarAccountIdentity: vi.fn(),
  getNativeBookingEntitlements: vi.fn(),
  revalidateBusinessData: vi.fn(),
}));

vi.mock("@/db", () => ({ db: mocks.db }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getClaims: mocks.getClaims } }),
}));
vi.mock("@/lib/team/context", () => ({ requirePermission: mocks.requirePermission }));
vi.mock("@/lib/native-booking/calendar", () => ({
  exchangeCalendarCode: mocks.exchangeCalendarCode,
  getCalendarAccountIdentity: mocks.getCalendarAccountIdentity,
}));
vi.mock("@/lib/billing/plan-gate", () => ({ getNativeBookingEntitlements: mocks.getNativeBookingEntitlements }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimited: () => false }));
vi.mock("@/lib/revalidate-data", () => ({ revalidateBusinessData: mocks.revalidateBusinessData }));
vi.mock("@/lib/crypto", () => ({ encrypt: (value: string) => `encrypted:${value}` }));

import { GET } from "./route";

const accountId = "00000000-0000-4000-8000-000000000001";
const closerId = "00000000-0000-4000-8000-000000000002";
const connectionId = "00000000-0000-4000-8000-000000000003";
const createdAt = new Date("2026-01-01T00:00:00.000Z");

type ExistingConnection = {
  id: string;
  userId: string;
  closerUserId: string;
  provider: "google";
  providerAccountSubject: string | null;
  providerAccountEmail: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  tokenExpiresAt: Date | null;
  selectedCalendarIds: string[];
  status: "connected" | "reconnect_required" | "revoked";
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function existingConnection(overrides: Partial<ExistingConnection> = {}): ExistingConnection {
  return {
    id: connectionId,
    userId: accountId,
    closerUserId: closerId,
    provider: "google",
    providerAccountSubject: "google-subject",
    providerAccountEmail: "old-address@example.test",
    accessTokenEncrypted: "old-access-token-encrypted",
    refreshTokenEncrypted: "old-refresh-token-encrypted",
    tokenExpiresAt: createdAt,
    selectedCalendarIds: ["primary"],
    status: "connected",
    lastError: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function setupExistingRows(rows: ExistingConnection[]) {
  mocks.db.select.mockReturnValue({
    from: () => ({
      where: (condition: unknown) => {
        mocks.db.where(condition);
        return { orderBy: async () => rows };
      },
    }),
  });
}

function setupPersistence() {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const insertValues = vi.fn().mockResolvedValue(undefined);
  mocks.db.update.mockReturnValue({ set: updateSet });
  mocks.db.insert.mockReturnValue({ values: insertValues });
  return { updateSet, updateWhere, insertValues };
}

function callbackRequest(storedCloserId = closerId) {
  const request = new NextRequest("https://minaly.example/api/native-calendar/google/callback?code=fixture-code&state=fixture-state");
  request.cookies.set("native_calendar_oauth_state", `google:fixture-state:${storedCloserId}:/settings/calendars`);
  return request;
}

describe("GET /api/native-calendar/google/callback account identity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getClaims.mockResolvedValue({ data: { claims: { sub: closerId } } });
    mocks.requirePermission.mockResolvedValue({ accountId });
    mocks.exchangeCalendarCode.mockResolvedValue({ accessToken: "new-access-token", refreshToken: "new-refresh-token", expiresInSeconds: 3600 });
    mocks.getCalendarAccountIdentity.mockResolvedValue({ subject: "google-subject", email: "new-address@example.test" });
    mocks.getNativeBookingEntitlements.mockResolvedValue({ enabled: true });
    setupExistingRows([]);
  });

  it("reconnects the same Google subject even when its email address changed", async () => {
    setupExistingRows([existingConnection({ providerAccountEmail: "old-address@example.test" })]);
    const persistence = setupPersistence();

    const response = await GET(callbackRequest(), { params: Promise.resolve({ provider: "google" }) });

    expect(response.headers.get("location")).toBe("https://minaly.example/settings/calendars?calendar=connected");
    expect(mocks.db.update).toHaveBeenCalledOnce();
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(mocks.requirePermission).toHaveBeenCalledWith(closerId, "ventes:rdv");
    const scopeQuery = new PgDialect().sqlToQuery(mocks.db.where.mock.calls[0]?.[0]);
    expect(scopeQuery.sql).toContain("user_id");
    expect(scopeQuery.sql).toContain("closer_user_id");
    expect(scopeQuery.params).toEqual(expect.arrayContaining([accountId, closerId, "google"]));
    expect(persistence.updateWhere).toHaveBeenCalledOnce();
    expect(persistence.updateSet.mock.calls[0]?.[0]).toMatchObject({
      userId: accountId,
      closerUserId: closerId,
      providerAccountSubject: "google-subject",
      providerAccountEmail: "new-address@example.test",
      accessTokenEncrypted: "encrypted:new-access-token",
      refreshTokenEncrypted: "encrypted:new-refresh-token",
      status: "connected",
    });
  });

  it("upgrades a legacy email-only row with the stable Google subject instead of inserting a duplicate", async () => {
    setupExistingRows([existingConnection({ providerAccountSubject: null, providerAccountEmail: "new-address@example.test" })]);
    const persistence = setupPersistence();

    await GET(callbackRequest(), { params: Promise.resolve({ provider: "google" }) });

    expect(mocks.db.update).toHaveBeenCalledOnce();
    expect(mocks.db.insert).not.toHaveBeenCalled();
    expect(persistence.updateSet.mock.calls[0]?.[0]).toMatchObject({ providerAccountSubject: "google-subject" });
  });

  it("does not merge distinct Google subjects that share an email address", async () => {
    setupExistingRows([existingConnection({ providerAccountSubject: "different-google-subject", providerAccountEmail: "new-address@example.test" })]);
    const persistence = setupPersistence();

    await GET(callbackRequest(), { params: Promise.resolve({ provider: "google" }) });

    expect(mocks.db.update).not.toHaveBeenCalled();
    expect(mocks.db.insert).toHaveBeenCalledOnce();
    expect(persistence.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      userId: accountId,
      closerUserId: closerId,
      providerAccountSubject: "google-subject",
      selectedCalendarIds: ["primary"],
    }));
  });

  it("rejects an OAuth state created for a different closer session", async () => {
    const response = await GET(callbackRequest("00000000-0000-4000-8000-000000000099"), { params: Promise.resolve({ provider: "google" }) });

    expect(response.headers.get("location")).toBe("https://minaly.example/sign-in");
    expect(mocks.db.select).not.toHaveBeenCalled();
    expect(mocks.db.update).not.toHaveBeenCalled();
    expect(mocks.db.insert).not.toHaveBeenCalled();
  });
});
