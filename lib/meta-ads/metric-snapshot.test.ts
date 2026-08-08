import { describe, expect, it } from "vitest";

import {
  buildMetaMetricCorrectionSnapshot,
  metaMetricCorrectionSnapshotChanged,
} from "./metric-snapshot";

describe("Meta metric correction snapshots", () => {
  it("keeps unavailable numeric fields null instead of displaying artificial zeroes", () => {
    const snapshot = buildMetaMetricCorrectionSnapshot({
      spendCents: 1_250,
      impressions: 100,
      leads: 0,
      purchaseValueCents: 0,
      availableMetrics: ["spend", "impressions"],
    });

    expect(snapshot).toMatchObject({ spendCents: 1_250, impressions: 100, leads: null, purchaseValueCents: null });
  });

  it("keeps a legitimate zero when Meta explicitly exposed the metric", () => {
    const snapshot = buildMetaMetricCorrectionSnapshot({
      leads: 0,
      availableMetrics: ["meta_action:leads"],
    });

    expect(snapshot.leads).toBe(0);
  });

  it("keeps legacy rows readable when no availability list exists", () => {
    const snapshot = buildMetaMetricCorrectionSnapshot({ leads: 0, impressions: 42 });

    expect(snapshot).toMatchObject({ leads: 0, impressions: 42 });
  });

  it("detects only visible correction changes", () => {
    const before = buildMetaMetricCorrectionSnapshot({ leads: 0, availableMetrics: ["spend"] });
    const after = buildMetaMetricCorrectionSnapshot({ leads: 1, availableMetrics: ["meta_action:leads"] });

    expect(metaMetricCorrectionSnapshotChanged(before, after)).toBe(true);
    expect(
      metaMetricCorrectionSnapshotChanged(
        buildMetaMetricCorrectionSnapshot({ leads: 0, availableMetrics: ["spend"] }),
        buildMetaMetricCorrectionSnapshot({ leads: 99, availableMetrics: ["spend"] }),
      ),
    ).toBe(false);
  });
});
