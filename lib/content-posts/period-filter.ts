// Shared by posts-table.tsx (Instagram, date stored as "YYYY-MM-DD") and
// youtube-videos-table.tsx (YouTube, date stored as a real Date) so both
// tables — and the KPI cards in contenu-view.tsx — filter "last N days"
// identically instead of drifting apart.
export type DateFilterKey = "7d" | "30d" | "3m" | "all";

export const DATE_FILTERS: { key: DateFilterKey; label: string; days: number | null }[] = [
  { key: "7d", label: "7 jours", days: 7 },
  { key: "30d", label: "30 jours", days: 30 },
  { key: "3m", label: "3 mois", days: 90 },
  { key: "all", label: "Tout", days: null },
];

export function isWithinPeriod(publishedAt: string | Date, period: DateFilterKey): boolean {
  const days = DATE_FILTERS.find((filter) => filter.key === period)?.days ?? null;
  if (days === null) return true;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const publishedTime = typeof publishedAt === "string" ? new Date(`${publishedAt}T00:00:00`).getTime() : publishedAt.getTime();
  return publishedTime >= cutoff.getTime();
}
