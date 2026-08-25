import { describe, expect, it } from "vitest";

import type { MonthWindow } from "./completed-months";
import type { ScaleScorePillar } from "./scale-score";
import { describeScaleScoreGap, scaleScoreGapSources } from "./scale-score";
import { currentMonthNote, scaleScoreGapMessage } from "./scale-score-copy";

function month(year: number, month: number): MonthWindow {
  return { year, month, range: { from: `${year}-${String(month).padStart(2, "0")}-01`, to: `${year}-${String(month).padStart(2, "0")}-28` } };
}

function pillar(key: ScaleScorePillar["key"], label: string, covered: boolean): ScaleScorePillar {
  return { key, label, covered, score: covered ? 80 : null };
}

const ALL_COVERED: ScaleScorePillar[] = [
  pillar("acquisition", "Acquisition", true),
  pillar("vente", "Vente", true),
  pillar("delivrabilite", "Délivrabilité", true),
];

describe("describeScaleScoreGap", () => {
  it("prioritizes missing months over pillar coverage", () => {
    const emptyMonths = [month(2026, 6)];
    const gap = describeScaleScoreGap(emptyMonths, ALL_COVERED);
    expect(gap).toEqual({ type: "missing_months", months: emptyMonths });
  });

  it("falls back to uncovered pillars when no months are empty", () => {
    const pillars = [pillar("acquisition", "Acquisition", false), pillar("vente", "Vente", false), pillar("delivrabilite", "Délivrabilité", true)];
    const gap = describeScaleScoreGap([], pillars);
    expect(gap).toEqual({ type: "low_coverage", pillarLabels: ["Acquisition", "Vente"] });
  });

  it("returns null when nothing is missing (score would not be null in practice)", () => {
    expect(describeScaleScoreGap([], ALL_COVERED)).toBeNull();
  });
});

describe("scaleScoreGapMessage", () => {
  it("names a single missing month", () => {
    expect(scaleScoreGapMessage({ type: "missing_months", months: [month(2026, 6)] })).toBe("Il me manque Juin pour te noter.");
  });

  it("joins two missing months with 'et'", () => {
    expect(scaleScoreGapMessage({ type: "missing_months", months: [month(2026, 6), month(2026, 7)] })).toBe(
      "Il me manque Juin et Juillet pour te noter."
    );
  });

  it("joins three missing months with commas and a final 'et'", () => {
    expect(scaleScoreGapMessage({ type: "missing_months", months: [month(2026, 5), month(2026, 6), month(2026, 7)] })).toBe(
      "Il me manque Mai, Juin et Juillet pour te noter."
    );
  });

  it("names uncovered pillars", () => {
    expect(scaleScoreGapMessage({ type: "low_coverage", pillarLabels: ["Acquisition", "Vente"] })).toBe(
      "Il me manque des données côté Acquisition et Vente pour te noter."
    );
  });
});

describe("scaleScoreGapSources", () => {
  it("opens the relevant month modal for missing months", () => {
    expect(scaleScoreGapSources({ type: "missing_months", months: [month(2026, 6)] })).toEqual([
      { key: "month", href: "/datas?year=2026&month=6&scaleScore=month", year: 2026, month: 6 },
    ]);
  });

  it("opens the relevant destination for uncovered pillars", () => {
    expect(scaleScoreGapSources({ type: "low_coverage", pillarLabels: ["Acquisition", "Vente", "Délivrabilité"] }, { acquisition: { year: 2026, month: 4 } })).toEqual([
      { key: "acquisition", href: "/datas?year=2026&month=4&scaleScore=acquisition", year: 2026, month: 4 },
      { key: "delivery", href: "/business?scaleScore=delivery#livraison" },
    ]);
  });

  it("opens the exact sales month when a closing field is missing", () => {
    expect(scaleScoreGapSources({ type: "low_coverage", pillarLabels: ["Vente"] }, { sales: { year: 2026, month: 4 } })).toEqual([
      { key: "sales", href: "/datas?year=2026&month=4&scaleScore=sales", year: 2026, month: 4 },
    ]);
  });

  it("does not invent a destination without a missing month", () => {
    expect(scaleScoreGapSources({ type: "low_coverage", pillarLabels: ["Acquisition", "Vente"] })).toEqual([]);
  });
});

describe("currentMonthNote", () => {
  it("points to next month within the same year", () => {
    expect(currentMonthNote(month(2026, 8))).toBe("Août ne compte pas encore dans ton score. On l'ajoutera le 1er septembre.");
  });

  it("wraps December into January", () => {
    expect(currentMonthNote(month(2026, 12))).toBe("Décembre ne compte pas encore dans ton score. On l'ajoutera le 1er janvier.");
  });
});
