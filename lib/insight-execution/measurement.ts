import type { BaselineSnapshot, MeasurementEvidenceType, MeasurementSnapshot } from "./types";

export function compareBaselineSnapshots(baseline: BaselineSnapshot, after: BaselineSnapshot): MeasurementSnapshot | null {
  if (baseline.metricKey !== after.metricKey || baseline.unit !== after.unit) return null;

  const cashImpactEur = baseline.cashValueEur !== null && baseline.cashValueEur !== undefined && after.cashValueEur !== null && after.cashValueEur !== undefined
    ? after.cashValueEur - baseline.cashValueEur
    : null;

  return {
    metricKey: after.metricKey,
    unit: after.unit,
    evidence: "observed",
    beforeValue: baseline.value,
    afterValue: after.value,
    deltaValue: after.value - baseline.value,
    beforePeriodStart: baseline.periodStart,
    beforePeriodEnd: baseline.periodEnd,
    afterPeriodStart: after.periodStart,
    afterPeriodEnd: after.periodEnd,
    sampleSize: after.sampleSize,
    cashImpactEur,
    cashCurrency: cashImpactEur === null ? null : "EUR",
    source: after.source,
    note: null,
  };
}

export function measurementEvidenceLabel(evidence: MeasurementEvidenceType): string {
  switch (evidence) {
    case "observed":
      return "Impact observé";
    case "estimated":
      return "Gain estimé post-action";
    case "not_calculable":
      return "Non calculable";
    case "qualitative":
      return "Observation utilisateur";
  }
}
