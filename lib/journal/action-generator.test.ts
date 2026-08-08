import { describe, expect, it } from "vitest";

import { makeLeadAction, makeLeverAction, makeMetricAction, sortJournalActions } from "./action-generator";

describe("journal action generator", () => {
  it("creates an imperative bottleneck action with the calculated impact", () => {
    const action = makeMetricAction({
      key: "responseRate",
      label: "Taux de réponse",
      category: "Setting",
      explanation: "Le taux reste sous le benchmark.",
      monthlyGainEur: 2400,
      extraClients: 1,
      priorityScore: 78,
      status: "pending",
    });

    expect(action.title).toBe("Réécris ton premier message de setting");
    expect(action.impact).toEqual({ value: 2400, unit: "eur_month" });
    expect(action.chatContext.topicKey).toBe("responseRate");
  });

  it("uses the first starter-plan step for an absent lever and preserves a range", () => {
    const action = makeLeverAction({
      leverKey: "ads",
      label: "Publicité",
      category: "Acquisition",
      impactAmountEur: null,
      impactRangeEur: { min: 1200, max: 2400 },
      impactExplanation: "Test prudent.",
      starterStep: "Choisis une audience test",
      effort: "moyen",
      priorityScore: 42,
      status: "pending",
    });

    expect(action.title).toBe("Choisis une audience test");
    expect(action.impact).toMatchObject({ unit: "eur_month", range: { min: 1200, max: 2400 } });
  });

  it("surfaces overdue actions before a higher-scored action", () => {
    const overdue = makeLeadAction({
      leadId: "lead-1",
      leadName: "Ada Lovelace",
      note: "Reprendre la discussion",
      reminderDate: "2026-08-01",
      priorityScore: 1,
      overdueDays: 7,
    });
    const highScore = makeMetricAction({
      key: "closingRate",
      label: "Closing",
      category: "Closing",
      explanation: "Sous le benchmark.",
      monthlyGainEur: 9000,
      extraClients: 2,
      priorityScore: 99,
      status: "pending",
    });

    expect(sortJournalActions([highScore, overdue]).map((action) => action.id)).toEqual([
      "lead_reminder:lead-1",
      "diagnostic_metric:closingRate",
    ]);
  });
});

