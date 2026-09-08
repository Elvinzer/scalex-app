import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stored: new Map<string, unknown>(),
  setting: vi.fn<(...args: string[]) => Promise<unknown[]>>(),
  closing: vi.fn(async () => []),
  monthly: vi.fn(async () => []),
  calls: vi.fn(async () => []),
  sales: vi.fn(async () => []),
  leads: vi.fn(async () => []),
  history: vi.fn(async () => []),
  youtube: vi.fn(async () => new Map()),
  instagram: vi.fn(async () => new Map()),
  content: vi.fn(async () => []),
  attribution: vi.fn(async () => new Map()),
  sql: vi.fn(async () => []),
}));

vi.mock("next/cache", () => ({
  unstable_cache: (loader: () => Promise<unknown>, keys: string[]) => async () => {
    const key = `${loader.toString()}:${keys.join(":")}`;
    if (mocks.stored.has(key)) return mocks.stored.get(key);
    const result = await loader();
    // Next's Data Cache serializes Dates. Model a hit as well as a cold read.
    mocks.stored.set(key, JSON.parse(JSON.stringify(result)));
    return result;
  },
}));
vi.mock("@/db", () => ({ db: { select: () => ({ from: () => ({ where: mocks.sql }) }) } }));
vi.mock("@/lib/monthly-metrics/queries", () => ({ getSettingKpiEntries: mocks.setting, getClosingKpiEntries: mocks.closing, getAllMonthlyMetrics: mocks.monthly, getSalesCallKpiRecords: mocks.calls }));
vi.mock("@/lib/sales/queries", () => ({ getSales: mocks.sales }));
vi.mock("@/lib/leads/queries", () => ({ getLeads: mocks.leads, getLeadStageHistory: mocks.history }));
vi.mock("@/lib/youtube/queries", () => ({ getYoutubeVideoInsightsMap: mocks.youtube }));
vi.mock("@/lib/instagram/queries", () => ({ getInstagramPostInsightsMap: mocks.instagram }));
vi.mock("@/lib/content-posts/queries", () => ({ getContentPosts: mocks.content }));
vi.mock("@/lib/youtube/attribution", () => ({ getVideoAttributionTotals: mocks.attribution }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.stored.clear();
  mocks.setting.mockResolvedValue([]);
  mocks.youtube.mockResolvedValue(new Map());
});

describe("diagnostic sources", () => {
  it("shares cold sources between 100 concurrent page/sidebar requests and then uses the warm cache", async () => {
    const { getDiagnosticCoreData, getDiagnosticKpiRawData, getDashboardDiagnosticData } = await import("./request-cache");
    await Promise.all(Array.from({ length: 100 }, (_, index) => [getDiagnosticCoreData, getDiagnosticKpiRawData, getDashboardDiagnosticData][index % 3]("account-a")));
    expect(mocks.setting).toHaveBeenCalledTimes(1);
    expect(mocks.monthly).toHaveBeenCalledTimes(1);
    expect(mocks.sales).toHaveBeenCalledTimes(1);
    await getDashboardDiagnosticData("account-a");
    await getDiagnosticCoreData("account-a");
    expect(mocks.setting).toHaveBeenCalledTimes(1);
    await getDiagnosticCoreData("account-b");
    expect(mocks.setting).toHaveBeenCalledTimes(2);
    expect(mocks.setting).toHaveBeenLastCalledWith("account-b");
  });

  it("keeps financial data available when a media source fails and does not request media from the core", async () => {
    const { getDiagnosticCoreData, getDiagnosticKpiRawData } = await import("./request-cache");
    await getDiagnosticCoreData("account");
    expect(mocks.youtube).not.toHaveBeenCalled();
    expect(mocks.instagram).not.toHaveBeenCalled();
    expect(mocks.attribution).not.toHaveBeenCalled();
    mocks.youtube.mockRejectedValue(new Error("media unavailable"));
    await expect(getDiagnosticKpiRawData("account")).rejects.toThrow("media unavailable");
    await expect(getDiagnosticCoreData("account")).resolves.toHaveProperty("allMonthlyRows", []);
  });

  it("restores Dates on cache hits so pipeline and daily computations can use them", async () => {
    const now = new Date("2026-08-15T12:00:00Z");
    mocks.setting.mockResolvedValue([{ createdAt: now, updatedAt: now }]);
    const { getDiagnosticCoreData } = await import("./request-cache");
    await getDiagnosticCoreData("account");
    const warm = await getDiagnosticCoreData("account");
    expect(warm.allSettingEntries[0].createdAt).toEqual(now);
    expect(warm.allSettingEntries[0].createdAt).toBeInstanceOf(Date);
    expect(mocks.setting).toHaveBeenCalledTimes(1);
  });

  it("loads dashboard content without requesting full Instagram or YouTube insight payloads", async () => {
    const { getDashboardDiagnosticData } = await import("./request-cache");
    await getDashboardDiagnosticData("account");
    expect(mocks.youtube).not.toHaveBeenCalled();
    expect(mocks.instagram).not.toHaveBeenCalled();
    expect(mocks.content).toHaveBeenCalledTimes(1);
    expect(mocks.attribution).toHaveBeenCalledTimes(1);
  });
});
