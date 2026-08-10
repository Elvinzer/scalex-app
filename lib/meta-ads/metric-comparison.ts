export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return current / previous - 1;
}

<<<<<<< HEAD
export function trendLabel(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "— · comparaison indisponible";
  if (previous === 0) {
    return current === 0
      ? "stable · période précédente nulle"
      : "nouvelle base · période précédente nulle";
  }
  const percentage = Math.round((current / previous - 1) * 100);
  return `${percentage > 0 ? "+" : ""}${percentage}% vs période précédente`;
=======
export function trendLabel(current: number | null, previous: number | null, locale = "fr"): string {
  const english = locale === "en";
  if (current === null || previous === null) return english ? "Trend: — · comparison unavailable" : "Évolution : — · comparaison indisponible";
  if (previous === 0) {
    return current === 0
      ? english ? "Trend: stable · previous period was zero" : "Évolution : stable · période précédente nulle"
      : english ? "Trend: new baseline · previous period was zero" : "Évolution : nouvelle base · période précédente nulle";
  }
  const percentage = Math.round((current / previous - 1) * 100);
  return english
    ? `Trend: ${percentage > 0 ? "+" : ""}${percentage}% vs previous period`
    : `Évolution : ${percentage > 0 ? "+" : ""}${percentage}% vs période précédente`;
>>>>>>> b780dd3 (Add French localization for integrations, navigation, referral, and sales tracking)
}
