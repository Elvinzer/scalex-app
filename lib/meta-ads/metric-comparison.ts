export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return current / previous - 1;
}

export function trendLabel(current: number | null, previous: number | null, locale = "fr"): string {
  const english = locale === "en";
  if (current === null || previous === null) return english ? "Trend unavailable for this period" : "Évolution : — · comparaison indisponible";
  if (previous === 0) {
    return current === 0
      ? english ? "Trend: stable · previous period was zero" : "Évolution : stable · période précédente nulle"
      : english ? "Trend: new baseline · previous period was zero" : "Évolution : nouvelle base · période précédente nulle";
  }
  const percentage = Math.round((current / previous - 1) * 100);
  return english
    ? `Trend: ${percentage > 0 ? "+" : ""}${percentage}% vs previous period`
    : `Évolution : ${percentage > 0 ? "+" : ""}${percentage}% vs période précédente`;
}
