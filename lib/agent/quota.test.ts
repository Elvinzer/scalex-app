import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ total: 0, execute: vi.fn(), write: vi.fn(), transaction: vi.fn() }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));

import { checkAndIncrementSharedUsage, DEFAULT_PLATFORM_SHARED_MONTHLY_LIMIT, getPlatformSharedMonthlyLimit } from "./quota";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.total = 0;
  mocks.transaction.mockImplementation(async (run) => run({ execute: mocks.execute, select: () => ({ from: () => ({ where: async () => [{ count: mocks.total }] }) }), insert: () => ({ values: () => ({ onConflictDoUpdate: mocks.write }) }) }));
});
afterEach(() => vi.unstubAllEnvs());

describe("platform shared-key ceiling", () => {
  it("does not let invalid configuration disable the safety ceiling", () => {
    for (const invalid of ["", "0", "-1", "bad", "Infinity", "9007199254740992"]) expect(getPlatformSharedMonthlyLimit(invalid)).toBe(DEFAULT_PLATFORM_SHARED_MONTHLY_LIMIT);
    expect(getPlatformSharedMonthlyLimit("42")).toBe(42);
  });

  it("rejects a reservation at the platform ceiling before incrementing", async () => {
    vi.stubEnv("ANTHROPIC_SHARED_MONTHLY_REQUEST_LIMIT", "2");
    mocks.total = 2;
    await expect(checkAndIncrementSharedUsage("business-b")).rejects.toThrow();
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("reserves below the ceiling after acquiring the database lock", async () => {
    vi.stubEnv("ANTHROPIC_SHARED_MONTHLY_REQUEST_LIMIT", "2");
    mocks.total = 1;
    await checkAndIncrementSharedUsage("business-b");
    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.write).toHaveBeenCalledOnce();
  });

  it("stops shared reservations immediately with the kill switch", async () => {
    vi.stubEnv("ANTHROPIC_SHARED_DISABLED", "true");
    await expect(checkAndIncrementSharedUsage("business-b")).rejects.toThrow();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
