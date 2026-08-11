import { describe, expect, it } from "vitest";

import { DEFAULT_ACQUISITION_FUNNELS } from "./catalog";
import { activeLegacyMetricKeys, normalizeAcquisitionSelection } from "./selection";

describe("acquisition funnel selection", () => {
  it("infers a lead magnet for an old profile without a saved selection", () => {
    const selection = normalizeAcquisitionSelection({
      leadMagnet: { enabled: "yes", type: null, title: "", promise: "", url: "" },
      vsl: { enabled: "no", url: "", durationMin: null, cta: "" },
      setting: { enabled: "no", channel: "", operator: "" },
    });

    expect(selection).toEqual({ funnels: ["lead_magnet"], primaryFunnel: "lead_magnet", inferred: true });
  });

  it("keeps multiple active journeys and only exposes their legacy rates", () => {
    const selection = normalizeAcquisitionSelection({
      funnels: ["lead_magnet", "setting_dm"],
      primaryFunnel: "lead_magnet",
      leadMagnet: { enabled: "yes", type: null, title: "", promise: "", url: "" },
      vsl: { enabled: "no", url: "", durationMin: null, cta: "" },
      setting: { enabled: "yes", channel: "DM", operator: "moi" },
    }, DEFAULT_ACQUISITION_FUNNELS);

    expect(activeLegacyMetricKeys(selection, DEFAULT_ACQUISITION_FUNNELS)).toEqual([
      "responseRate",
      "proposalRate",
      "bookingRate",
      "showUpRate",
      "closingRate",
    ]);
  });
});
