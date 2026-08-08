import { describe, expect, it } from "vitest";

import { metaAdsErrorMessage } from "./messages";

describe("Meta Ads error messages", () => {
  it("explains known OAuth failures", () => {
    expect(metaAdsErrorMessage("ads_read")).toContain("ads_read");
    expect(metaAdsErrorMessage("denied")).toContain("refusé");
    expect(metaAdsErrorMessage("state")).toContain("expiré");
    expect(metaAdsErrorMessage("token")).toContain("jeton");
  });

  it("does not render an arbitrary query-string value", () => {
    expect(metaAdsErrorMessage("<script>alert(1)</script>")).toBeNull();
    expect(metaAdsErrorMessage(null)).toBeNull();
  });
});
