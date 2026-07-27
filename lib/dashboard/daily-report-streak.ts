import { toIsoDate, todayUtc } from "@/lib/date-range";

export type RecentDailyReport = {
  date: string;
  newSubscribers: number | null;
  salesClosed: number | null;
};

// A day "counts" if EITHER table has a row for it — the Rapport Daily
// dialog writes both at once, but older days may only have one (the
// standalone Setting/Closing "Ajouter un jour" forms predate it and still
// exist). Union, not intersection, so a partial day still keeps the streak.
export function computeDailyReportStreak(
  allSettingEntries: { date: string; newSubscribers: number }[],
  allClosingEntries: { date: string; salesClosed: number }[]
): { streak: number; recentReports: RecentDailyReport[] } {
  const settingByDate = new Map(allSettingEntries.map((entry) => [entry.date, entry]));
  const closingByDate = new Map(allClosingEntries.map((entry) => [entry.date, entry]));
  const allDates = new Set([...settingByDate.keys(), ...closingByDate.keys()]);

  // Consecutive days walking back from today. If today isn't filled yet,
  // start from yesterday instead — the streak isn't "broken" just because
  // today's report hasn't happened yet (the whole point is to encourage
  // filling it before it does).
  const cursor = todayUtc();
  if (!allDates.has(toIsoDate(cursor))) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  let streak = 0;
  while (allDates.has(toIsoDate(cursor))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const recentReports: RecentDailyReport[] = [...allDates]
    .sort((a, b) => (a < b ? 1 : -1))
    .slice(0, 7)
    .map((date) => ({
      date,
      newSubscribers: settingByDate.get(date)?.newSubscribers ?? null,
      salesClosed: closingByDate.get(date)?.salesClosed ?? null,
    }));

  return { streak, recentReports };
}
