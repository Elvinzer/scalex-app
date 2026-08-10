export function targetVariance(actual: number | null, target: number | null): number | null {
  if (actual === null || target === null || target <= 0) return null;
  return (actual - target) / target;
}

export function formatSignedPercent(value: number | null): string {
  if (value === null) return "—";
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

export function targetVarianceLabel(actual: number | null, target: number | null, locale = "fr"): string | null {
  if (target === null) return null;
  const variance = targetVariance(actual, target);
  return variance === null
    ? locale === "en" ? "gap cannot be calculated" : "écart non calculable"
    : locale === "en" ? `gap ${formatSignedPercent(variance)}` : `écart ${formatSignedPercent(variance)}`;
}
