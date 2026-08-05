// Deterministic, template-based copy for the Scale Score's null-score empty
// state — same rule as lever-advice.ts's adviceFor: never AI-generated,
// always names the real blocker (see describeScaleScoreGap) instead of a
// vague placeholder.
import { MONTH_LABELS } from "@/lib/monthly-metrics/types";

import type { MonthWindow } from "./completed-months";
import type { ScaleScoreGap } from "./scale-score";

const monthListFormatter = new Intl.ListFormat("fr", { style: "long", type: "conjunction" });

function monthLabel(window: MonthWindow): string {
  return MONTH_LABELS[window.month - 1];
}

// Falco's line when score === null.
export function scaleScoreGapMessage(gap: ScaleScoreGap): string {
  if (gap.type === "missing_months") {
    return `Il me manque ${monthListFormatter.format(gap.months.map(monthLabel))} pour te noter.`;
  }
  return `Il me manque des données côté ${monthListFormatter.format(gap.pillarLabels)} pour te noter.`;
}

// Secondary caption shown under the gap message when the user has already
// started filling in the current month — the Scale Score window never
// includes it (lib/diagnostic/completed-months.ts's lastCompletedMonths),
// however complete it gets, so this names that instead of leaving it silent.
export function currentMonthNote(currentMonth: MonthWindow): string {
  const label = monthLabel(currentMonth);
  const nextLabel = MONTH_LABELS[currentMonth.month % 12]; // wraps December -> Janvier
  return `${label} ne compte pas encore dans ton score. On l'ajoutera le 1er ${nextLabel.toLowerCase()}.`;
}
