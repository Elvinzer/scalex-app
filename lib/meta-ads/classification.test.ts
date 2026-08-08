import { describe, expect, it } from "vitest";

import { classifyMetaCampaign } from "./classification";

describe("Meta campaign classification", () => {
  it.each([
    [{ name: "VSL acquisition", objective: "VIDEO_VIEWS" }, "vsl"],
    [{ name: "Masterclass live", objective: "LEAD_GENERATION" }, "webinar"],
    [{ name: "Profile visits Instagram", objective: "PROFILE_VISITS" }, "instagram_profile_growth"],
    [{ name: "Website visitors 30 days", objective: "CONVERSIONS" }, "retargeting"],
  ])("classifies %j as %s", (raw, expected) => {
    expect(classifyMetaCampaign(raw).type).toBe(expected);
  });

  it("falls back to other when no campaign signal is present", () => {
    expect(classifyMetaCampaign({ name: "Acquisition", objective: "CONVERSIONS" }).type).toBe("other");
  });
});
