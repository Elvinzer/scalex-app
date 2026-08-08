import { describe, expect, it } from "vitest";

import { computeMetaConsolidationUntil, metaAdsManagerUrl, normalizeAdAccountId, normalizeMetaPeriodDays } from "./protocol";

describe("Meta Ads protocol", () => {
  it("normalises ad account identifiers without duplicating act_", () => {
    expect(normalizeAdAccountId("123456789")).toBe("act_123456789");
    expect(normalizeAdAccountId("act_123456789")).toBe("act_123456789");
  });

  it("keeps only the supported reading periods", () => {
    expect(normalizeMetaPeriodDays("7")).toBe(7);
    expect(normalizeMetaPeriodDays("365")).toBe(30);
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
