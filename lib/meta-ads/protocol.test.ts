import { describe, expect, it } from "vitest";

import { comparisonMetaPeriod, computeMetaConsolidationUntil, META_GRAPH_API_VERSION, metaAdsManagerUrl, normalizeAdAccountId, normalizeMetaPeriodDays, normalizeMetaPeriodSelection, resolveMetaPeriod, serializeMetaPeriodSelection } from "./protocol";

describe("Meta Ads protocol", () => {
  it("uses the supported Graph API fallback when no version is configured", () => {
    expect(META_GRAPH_API_VERSION).toBe(process.env.META_GRAPH_API_VERSION ?? "v25.0");
  });

  it("normalises ad account identifiers without duplicating act_", () => {
    expect(normalizeAdAccountId("123456789")).toBe("act_123456789");
    expect(normalizeAdAccountId("act_123456789")).toBe("act_123456789");
  });

  it("keeps only the supported reading periods", () => {
    expect(normalizeMetaPeriodDays("7")).toBe(7);
    expect(normalizeMetaPeriodDays("365")).toBe(30);
  });

  it("resolves the previous calendar month and compares it with the preceding month", () => {
    const referenceDate = new Date("2026-08-10T12:00:00.000Z");
    const selection = normalizeMetaPeriodSelection({ meta_range: "previous_month" }, referenceDate);
    const period = resolveMetaPeriod(selection, referenceDate);
    expect(period).toEqual({ start: "2026-07-01", end: "2026-07-31", days: 31 });
    expect(comparisonMetaPeriod(period, selection)).toEqual({ start: "2026-06-01", end: "2026-06-30" });
  });

  it("accepts a valid custom range and falls back safely for invalid ranges", () => {
    const referenceDate = new Date("2026-08-10T12:00:00.000Z");
    const custom = normalizeMetaPeriodSelection({ meta_range: "custom", meta_from: "2026-07-12", meta_to: "2026-08-10" }, referenceDate);
    expect(resolveMetaPeriod(custom, referenceDate)).toEqual({ start: "2026-07-12", end: "2026-08-10", days: 30 });
    expect(serializeMetaPeriodSelection(custom)).toBe("meta_range=custom&meta_from=2026-07-12&meta_to=2026-08-10");
    expect(normalizeMetaPeriodSelection({ meta_range: "custom", meta_from: "2026-08-11", meta_to: "2026-08-12" }, referenceDate)).toEqual({ kind: "days", days: 30 });
  });

  it("computes consolidation from attribution windows plus processing delay", () => {
    expect(computeMetaConsolidationUntil("2026-08-01")).toEqual(new Date("2026-08-10T00:00:00.000Z"));
    expect(computeMetaConsolidationUntil("2026-08-01", { clickWindow: "1d_click", viewWindow: "1d_view" }, 1)).toEqual(new Date("2026-08-03T00:00:00.000Z"));
  });

  it("builds a server-side deep link at the most precise supplied level", () => {
    const url = metaAdsManagerUrl("act_123456789", "campaign-1", "adset-2", "ad-3");
    expect(url).toContain("act=123456789");
    expect(url).toContain("selected_campaign_ids=campaign-1");
    expect(url).toContain("selected_adset_ids=adset-2");
    expect(url).toContain("selected_ad_ids=ad-3");
  });
});
