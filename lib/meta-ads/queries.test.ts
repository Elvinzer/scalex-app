import { describe, expect, it } from "vitest";

import { countUnattributedMetaSales, metaSalesCoverageRate, resolveMetaTouchpointCampaign } from "./attribution-resolution";

const campaigns = new Set(["campaign-1", "campaign-2"]);
const adSetCampaigns = new Map([
  ["adset-1", "campaign-1"],
  ["adset-2", "campaign-2"],
]);
const adCampaigns = new Map([
  ["ad-1", "campaign-1"],
  ["ad-2", "campaign-2"],
]);

describe("Meta touchpoint campaign resolution", () => {
  it("keeps a valid campaign-level reference", () => {
    expect(resolveMetaTouchpointCampaign({ campaignExternalId: "campaign-2", adSetExternalId: "adset-1", adExternalId: "ad-1" }, campaigns, adSetCampaigns, adCampaigns)).toBe("campaign-2");
  });

  it("recovers a campaign from an ad-set-only touchpoint", () => {
    expect(resolveMetaTouchpointCampaign({ campaignExternalId: null, adSetExternalId: "adset-1", adExternalId: null }, campaigns, adSetCampaigns, adCampaigns)).toBe("campaign-1");
  });

  it("recovers a campaign from an ad-only touchpoint", () => {
    expect(resolveMetaTouchpointCampaign({ campaignExternalId: null, adSetExternalId: null, adExternalId: "ad-2" }, campaigns, adSetCampaigns, adCampaigns)).toBe("campaign-2");
  });

  it("does not attribute an unknown or unidentifiable touchpoint", () => {
    expect(resolveMetaTouchpointCampaign({ campaignExternalId: "deleted-campaign", adSetExternalId: "unknown-adset", adExternalId: "unknown-ad" }, campaigns, adSetCampaigns, adCampaigns)).toBeNull();
  });

  it("counts coverage only for touchpoints belonging to the selected Meta account", () => {
    expect(
      metaSalesCoverageRate(
        [{ metaTouchpointId: "touchpoint-current" }, { metaTouchpointId: "touchpoint-other-account" }, { metaTouchpointId: null }],
        new Set(["touchpoint-current"]),
      ),
    ).toBeCloseTo(1 / 3);
  });

  it("returns no coverage when the period has no sales", () => {
    expect(metaSalesCoverageRate([], new Set())).toBeNull();
  });

  it("counts null and unknown touchpoint sales as unattributed", () => {
    expect(
      countUnattributedMetaSales(
        [{ metaTouchpointId: "touchpoint-current" }, { metaTouchpointId: "touchpoint-other-account" }, { metaTouchpointId: null }],
        new Set(["touchpoint-current"]),
      ),
    ).toBe(2);
  });
});
