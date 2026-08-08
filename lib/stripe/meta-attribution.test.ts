import { describe, expect, it } from "vitest";

import { readStripeMetaTracking } from "./meta-attribution";

describe("read-only Stripe Meta attribution", () => {
  it("prefers an explicit charge touchpoint over PaymentIntent metadata", () => {
    const chargeToken = "a".repeat(64);
    const intentToken = "b".repeat(64);

    expect(
      readStripeMetaTracking(
        { sx_mt: chargeToken, utm_campaign: "charge-campaign" },
        { sx_mt: intentToken, utm_campaign: "intent-campaign" },
      ),
    ).toMatchObject({
      metaTouchpointToken: chargeToken,
      utmCampaign: "charge-campaign",
    });
  });

  it("merges a charge's partial tracking with a PaymentIntent fallback", () => {
    const intentToken = "c".repeat(64);

    expect(
      readStripeMetaTracking(
        { utm_source: "meta" },
        { sx_mt: intentToken, campaign_id: "campaign-123" },
      ),
    ).toMatchObject({
      utmSource: "meta",
      metaTouchpointToken: intentToken,
      metaCampaignExternalId: "campaign-123",
    });
  });

  it("keeps the no-signal case empty instead of guessing a campaign", () => {
    const result = readStripeMetaTracking({ email: "person@example.com" }, { customer: "cus_123" });

    expect(result.metaTouchpointToken).toBeNull();
    expect(result.metaCampaignExternalId).toBeNull();
    expect(result.utmCampaign).toBeNull();
  });
});
