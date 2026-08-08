import { describe, expect, it } from "vitest";

import { buildMetaAudienceWarnings, type MetaAudienceWarningInput } from "./audience-warnings";

const thresholds = {
  minImpressions: 1_000,
  minClicks: 50,
  frequencySaturation: 3,
};

function audience(overrides: Partial<MetaAudienceWarningInput> = {}): MetaAudienceWarningInput {
  return {
    id: "adset-1",
    name: "Visiteurs 30 jours",
    active: true,
    included: ["Visiteurs 30 jours"],
    excluded: [],
    targetingAvailable: true,
    impressions: 2_000,
    linkClicks: 100,
    frequency: 1.5,
    ...overrides,
  };
}

describe("buildMetaAudienceWarnings", () => {
  it("warns when the observed volume is below the conclusion thresholds", () => {
    const warnings = buildMetaAudienceWarnings(
      [audience({ impressions: 900, linkClicks: 40 })],
      thresholds,
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      kind: "insufficient_volume",
      threshold: 1_000,
      impressions: 900,
      linkClicks: 40,
    });
  });

  it("warns when frequency reaches the configured saturation threshold", () => {
    const warnings = buildMetaAudienceWarnings([audience({ frequency: 3.2 })], thresholds);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      kind: "frequency_saturation",
      threshold: 3,
      frequency: 3.2,
    });
  });

  it("flags identical active targeting as probable overlap, not as measured overlap", () => {
    const warnings = buildMetaAudienceWarnings(
      [
        audience(),
        audience({ id: "adset-2", name: "Visiteurs 30j · variante", included: ["visiteurs 30 JOURS"] }),
      ],
      thresholds,
    );

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      kind: "probable_overlap",
      audienceIds: ["adset-1", "adset-2"],
      threshold: 2,
    });
  });

  it("does not infer overlap when targeting is unavailable or different", () => {
    const warnings = buildMetaAudienceWarnings(
      [
        audience({ targetingAvailable: false }),
        audience({ id: "adset-2", name: "Engagés 30 jours", included: ["Engagés 30 jours"] }),
      ],
      thresholds,
    );

    expect(warnings).toHaveLength(0);
  });
});
