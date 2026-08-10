import { cache } from "react";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { streaks } from "@/db/schema";
import { toIsoDate, todayUtc } from "@/lib/date-range";

import { readActivityLog } from "./collect";
import { addDays, computeStreak, weeklyProgress, GRACE_DAYS_PER_MONTH } from "./rules";
import { refreshStreak, type StreakSnapshot } from "./service";

const WINDOW_DAYS = 120;

// The read path, used by every page render. It must be cheap: the flame sits
// in the sidebar, so this runs on literally every navigation.
//
// Refreshing (re-reading six source tables and rewriting the cache) happens
// only when it can actually change something:
//   • the cached streak row is from a previous day, or
//   • today has no activity row yet — precisely the window in which a new
//     action needs to light the flame.
// Once the user's first activity of the day is cached, every later navigation
// serves from activity_log alone. The daily cron covers accounts that never
// open the app.
// Memoized per userId for the lifetime of one request — same pattern as
// lib/diagnostic/request-cache.ts. app/(app)/layout.tsx (sidebar flame) and
// the Journal page both need the snapshot and render concurrently, so without
// this they each triggered their own refresh: two identical full recomputes
// per navigation, racing each other on the same rows.
export const getStreakSnapshot = cache(async (userId: string): Promise<StreakSnapshot> => {
  const today = toIsoDate(todayUtc());
  const windowStart = addDays(today, -WINDOW_DAYS);

  const [row] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
  if (!row) return refreshStreak(userId);

  const activityDays = await readActivityLog(userId, windowStart);
  const cachedToday = activityDays.some((day) => day.date === today);
  const rowIsFromToday = toIsoDate(row.updatedAt) === today;

  if (!cachedToday || !rowIsFromToday) return refreshStreak(userId);

  // Recomputed from the cache rather than read off the stored counters: the
  // stored `current` is a snapshot of the last write, and a streak silently
  // ages (yesterday's 5 is today's 0 if nothing happened). Deriving on read is
  // the only way the number on screen is never stale.
  const computation = computeStreak({
    activityDays,
    today,
    state: { current: row.current, best: row.best },
    weeklyGoal: row.weeklyGoal,
  });
  const { done: weeklyDone } = weeklyProgress(activityDays, today);
  const todayEntry = activityDays.find((day) => day.date === today) ?? null;

  return {
    current: computation.current,
    best: computation.best,
    weeklyGoal: row.weeklyGoal,
    weeklyDone,
    weeklyGoalMet: weeklyDone >= row.weeklyGoal,
    graceUsedMonth: computation.graceUsedMonth,
    graceRemaining: Math.max(0, GRACE_DAYS_PER_MONTH - computation.graceUsedMonth),
    reminderOptIn: row.reminderOptIn,
    todayValidated: todayEntry !== null,
    todaySources: todayEntry?.sources ?? [],
    calendar: Array.from({ length: 30 }, (_, index) => {
      const date = addDays(today, -(29 - index));
      const active = activityDays.some((day) => day.date === date);
      const status = active
        ? "active"
        : computation.graceDates.includes(date)
          ? "grace"
          : computation.protectedDates.includes(date)
            ? "protected"
            : "empty";
      return { date, status } as const;
    }),
    // Celebrations are only ever emitted by the write path — a cached read
    // must never re-fire confetti the user already saw.
    celebrateMilestone: null,
    justBrokeFrom: null,
  };
});
