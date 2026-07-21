import { and, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { scaleScoreHistory } from "@/db/schema";
import { toIsoDate, todayUtc } from "@/lib/date-range";

const SPARKLINE_WEEKS = 8;
const SPARKLINE_LOOKBACK_DAYS = SPARKLINE_WEEKS * 7;

function daysAgoIso(days: number): string {
  const today = todayUtc();
  return toIsoDate(new Date(today.getTime() - days * 24 * 60 * 60 * 1000));
}

// Delta vs. the closest snapshot ON OR BEFORE `today - daysAgo` — not an
// exact-day match, since the daily cron only runs for accounts that had a
// computable score that day (see snapshot-scale-score.ts). Returns null if
// no snapshot exists that far back yet (e.g. a brand-new account), not 0 —
// "no history" and "no change" are different things the badge/modal must
// not conflate.
export async function getScaleScoreDelta(userId: string, daysAgo: number, currentScore: number): Promise<number | null> {
  const [row] = await db
    .select({ score: scaleScoreHistory.score })
    .from(scaleScoreHistory)
    .where(and(eq(scaleScoreHistory.userId, userId), lte(scaleScoreHistory.date, daysAgoIso(daysAgo))))
    .orderBy(desc(scaleScoreHistory.date))
    .limit(1);

  return row ? currentScore - row.score : null;
}

export type ScaleScoreSparklinePoint = { weekStart: string; score: number };

// One point per week over the last 8 weeks (the LAST snapshot within each
// week) — matches the modal's "mini-courbe d'évolution (8 dernières
// semaines)". Weeks with no snapshot at all are simply absent (a sparse
// line, not a fabricated flat one).
export async function getScaleScoreSparkline(userId: string): Promise<ScaleScoreSparklinePoint[]> {
  const rows = await db
    .select({ date: scaleScoreHistory.date, score: scaleScoreHistory.score })
    .from(scaleScoreHistory)
    .where(and(eq(scaleScoreHistory.userId, userId), gte(scaleScoreHistory.date, daysAgoIso(SPARKLINE_LOOKBACK_DAYS))))
    .orderBy(scaleScoreHistory.date);

  const byWeek = new Map<string, number>();
  for (const row of rows) {
    const weekStart = toIsoDate(mondayOfWeek(new Date(`${row.date}T00:00:00Z`)));
    byWeek.set(weekStart, row.score); // later rows in the same week overwrite — "last snapshot of the week"
  }

  return [...byWeek.entries()]
    .map(([weekStart, score]) => ({ weekStart, score }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .slice(-SPARKLINE_WEEKS);
}

function mondayOfWeek(date: Date): Date {
  const day = date.getUTCDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? 6 : day - 1;
  return new Date(date.getTime() - diffToMonday * 24 * 60 * 60 * 1000);
}
