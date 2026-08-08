import { describe, expect, it } from "vitest";

import { buildMetaTrackingUrl, mergeMetaTracking, readMetaTracking } from "./tracking";

describe("Meta tracking extraction", () => {
  it("prefers fresh landing-page fields while preserving missing first-party values", () => {
    const primary = readMetaTracking({ utm_source: "meta", campaign_id: "campaign-live" });
    const fallback = readMetaTracking({ utm_campaign: "stored-campaign", sx_mt: "a".repeat(64) });
    expect(mergeMetaTracking(primary, fallback)).toEqual({
      utmSource: "meta",
      utmMedium: null,
      utmCampaign: "stored-campaign",
      utmContent: null,
      utmTerm: null,
      metaTouchpointToken: "a".repeat(64),
      metaCampaignExternalId: "campaign-live",
      metaAdSetExternalId: null,
      metaAdExternalId: null,
    });
  });

  it("reads UTM fields and an opaque touchpoint from nested provider metadata", () => {
    const token = "a".repeat(64);
    expect(
      readMetaTracking({
        metadata: {
          utm_source: "meta",
          utm_campaign: "scale-x-vsl",
          sx_mt: token,
        },
      }),
    ).toEqual({
      utmSource: "meta",
      utmMedium: null,
      utmCampaign: "scale-x-vsl",
      utmContent: null,
      utmTerm: null,
      metaTouchpointToken: token,
      metaCampaignExternalId: null,
      metaAdSetExternalId: null,
      metaAdExternalId: null,
    });
  });

  it("ignores malformed tokens and trims bounded values", () => {
    const result = readMetaTracking({ utm_campaign: `  ${"x".repeat(400)}  `, sx_mt: "not-a-token" });
    expect(result.utmCampaign).toHaveLength(256);
    expect(result.metaTouchpointToken).toBeNull();
  });

  it("builds a tracking URL with explicit Meta identifiers and no personal data", () => {
    const url = buildMetaTrackingUrl("https://example.com/vsl?foo=bar", {
      touchpointToken: "c".repeat(64),
      campaignExternalId: "123",
      adSetExternalId: "456",
      adExternalId: "789",
      utmSource: "meta",
      utmMedium: "paid_social",
    });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("sx_mt")).toBe("c".repeat(64));
    expect(parsed.searchParams.get("campaign_id")).toBe("123");
    expect(parsed.searchParams.get("adset_id")).toBe("456");
    expect(parsed.searchParams.get("ad_id")).toBe("789");
    expect(parsed.searchParams.get("email")).toBeNull();
  });
});
