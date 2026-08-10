export function relativeChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return current / previous - 1;
}

export function trendLabel(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return "— · comparaison indisponible";
  if (previous === 0) {
    return current === 0
      ? "stable · période précédente nulle"
      : "nouvelle base · période précédente nulle";
  }
  const percentage = Math.round((current / previous - 1) * 100);
  return `${percentage > 0 ? "+" : ""}${percentage}% vs période précédente`;
}
