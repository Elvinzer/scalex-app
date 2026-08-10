import { eq } from "drizzle-orm";

import { db } from "@/db";
import { streaks } from "@/db/schema";
import { track } from "@/lib/analytics";
import { toIsoDate, todayUtc } from "@/lib/date-range";

import { collectActivityDays, replaceActivityWindow } from "./collect";
import {
  addDays,
  computeStreak,
  computeWeeklyGoal,
  monthKey,
  reachedMilestone,
  weekStart,
  weeklyProgress,
  GRACE_DAYS_PER_MONTH,
  MAX_WEEKLY_GOAL,
  MIN_WEEKLY_GOAL,
  type ActivityDay,
} from "./rules";
import type { ActivitySource } from "./sources";

// How far back the cache and the calendar look. 120 days covers the modal's
// 30-day calendar, the goal's 4-week window, and a streak long enough that
// nobody in this product will hit the edge.
const WINDOW_DAYS = 120;

export type StreakSnapshot = {
  current: number;
  best: number;
  weeklyGoal: number;
  weeklyDone: number;
  weeklyGoalMet: boolean;
  graceUsedMonth: number;
  graceRemaining: number;
  reminderOptIn: boolean;
  todayValidated: boolean;
  todaySources: ActivitySource[];
  // Last 30 days, oldest first — the modal's calendar.
  calendar: { date: string; status: "active" | "grace" | "protected" | "empty" }[];
  // Set for exactly one render after the threshold is crossed, then cleared.
  celebrateMilestone: number | null;
  justBrokeFrom: number | null;
};

async function loadStreakRow(userId: string) {
  const [row] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
  if (row) return row;

  const [created] = await db.insert(streaks).values({ userId }).onConflictDoNothing().returning();
  if (created) return created;

  const [existing] = await db.select().from(streaks).where(eq(streaks.userId, userId)).limit(1);
  return existing;
}

// Recomputes everything from the source tables and persists the result.
// Idempotent by construction: it derives, it never increments — running it
// twice in the same second produces the same row, which is what lets both the
// daily cron and any page render call it without coordination.
export async function refreshStreak(userId: string, options: { silent?: boolean } = {}): Promise<StreakSnapshot> {
  const today = toIsoDate(todayUtc());
  const windowStart = addDays(today, -WINDOW_DAYS);

  const [activityDays, row] = await Promise.all([collectActivityDays(userId, windowStart), loadStreakRow(userId)]);
  await replaceActivityWindow(userId, windowStart, activityDays);

  const weeklyGoal = resolveWeeklyGoal(row, activityDays, today);

  const computation = computeStreak({
    activityDays,
    today,
    state: { current: row?.current ?? 0, best: row?.best ?? 0 },
    weeklyGoal,
  });

  const previousCurrent = row?.current ?? 0;
  const lastCelebrated = row?.lastMilestoneCelebrated ?? 0;
  // A broken streak resets the celebration ceiling: rebuilding to 7 days is a
  // real milestone again, not a threshold "already used up".
  const celebrationFloor = computation.current === 0 ? 0 : lastCelebrated;
  const milestone = reachedMilestone(computation.current, celebrationFloor);

  await db
    .update(streaks)
    .set({
      current: computation.current,
      best: computation.best,
      graceUsedMonth: computation.graceUsedMonth,
      graceMonth: computation.graceMonth,
      weeklyGoal,
      lastAutoGoalMonth: row?.weeklyGoalIsManual ? row.lastAutoGoalMonth : monthKey(today),
      lastMilestoneCelebrated: milestone ?? celebrationFloor,
      updatedAt: new Date(),
    })
    .where(eq(streaks.userId, userId));

  const { done: weeklyDone } = weeklyProgress(activityDays, today);
  const todayEntry = activityDays.find((day) => day.date === today) ?? null;

  if (!options.silent) {
    // Fire-and-forget: analytics must never be able to break a page render.
    void emitEvents({
      userId,
      previousCurrent,
      computation: { current: computation.current, brokenFrom: computation.brokenFrom },
      milestone,
      todayEntry,
      weeklyDone,
      weeklyGoal,
      previousWeeklyDone: weeklyDone - (todayEntry ? 1 : 0),
    });
  }

  return {
    current: computation.current,
    best: computation.best,
    weeklyGoal,
    weeklyDone,
    weeklyGoalMet: weeklyDone >= weeklyGoal,
    graceUsedMonth: computation.graceUsedMonth,
    graceRemaining: Math.max(0, GRACE_DAYS_PER_MONTH - computation.graceUsedMonth),
    reminderOptIn: row?.reminderOptIn ?? false,
    todayValidated: todayEntry !== null,
    todaySources: todayEntry?.sources ?? [],
    calendar: buildCalendar(activityDays, computation.graceDates, computation.protectedDates, today),
    celebrateMilestone: milestone,
    justBrokeFrom: computation.brokenFrom,
  };
}

// The goal follows the user's real rhythm, recalculated once a month — unless
// they set it themselves, in which case it is left alone (§B: lowering it must
// carry no friction, and an automatic bump back up next month is friction).
function resolveWeeklyGoal(
  row: { weeklyGoal: number; weeklyGoalIsManual: boolean; lastAutoGoalMonth: string | null } | undefined,
  activityDays: ActivityDay[],
  today: string
): number {
  if (!row) return computeWeeklyGoal(activityDays, today);
  if (row.weeklyGoalIsManual) return clampGoal(row.weeklyGoal);
  if (row.lastAutoGoalMonth === monthKey(today)) return clampGoal(row.weeklyGoal);
  return computeWeeklyGoal(activityDays, today);
}

export function clampGoal(value: number): number {
  return Math.min(MAX_WEEKLY_GOAL, Math.max(MIN_WEEKLY_GOAL, Math.round(value)));
}

function buildCalendar(
  activityDays: ActivityDay[],
  graceDates: string[],
  protectedDates: string[],
  today: string
): StreakSnapshot["calendar"] {
  const active = new Set(activityDays.map((day) => day.date));
  const grace = new Set(graceDates);
  const shielded = new Set(protectedDates);

  return Array.from({ length: 30 }, (_, index) => {
    const date = addDays(today, -(29 - index));
    const status = active.has(date) ? "active" : grace.has(date) ? "grace" : shielded.has(date) ? "protected" : "empty";
    return { date, status } as const;
  });
}

async function emitEvents({
  userId,
  previousCurrent,
  computation,
  milestone,
  todayEntry,
  weeklyDone,
  weeklyGoal,
  previousWeeklyDone,
}: {
  userId: string;
  previousCurrent: number;
  computation: { current: number; brokenFrom: number | null };
  milestone: number | null;
  todayEntry: ActivityDay | null;
  weeklyDone: number;
  weeklyGoal: number;
  previousWeeklyDone: number;
}): Promise<void> {
  if (todayEntry && computation.current > previousCurrent) {
    await track("streak_day_validated", userId, { sources: todayEntry.sources });
  }
  if (milestone !== null) {
    await track("streak_milestone", userId, { days: milestone });
  }
  if (computation.brokenFrom !== null) {
    await track("streak_broken", userId, { previous_length: computation.brokenFrom });
  }
  // Only on the crossing, not on every render of an already-met week.
  if (weeklyDone >= weeklyGoal && previousWeeklyDone < weeklyGoal) {
    await track("weekly_goal_met", userId, { goal: weeklyGoal });
  }
}

export async function setWeeklyGoal(userId: string, goal: number): Promise<number> {
  const row = await loadStreakRow(userId);
  const next = clampGoal(goal);
  await track("weekly_goal_adjusted", userId, { from: row?.weeklyGoal ?? null, to: next });

  await db
    .update(streaks)
    .set({ weeklyGoal: next, weeklyGoalIsManual: true, goalUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(streaks.userId, userId));

  return next;
}

export async function setReminderOptIn(userId: string, optIn: boolean): Promise<void> {
  await loadStreakRow(userId);
  await db.update(streaks).set({ reminderOptIn: optIn, updatedAt: new Date() }).where(eq(streaks.userId, userId));
}

export { weekStart, MIN_WEEKLY_GOAL, MAX_WEEKLY_GOAL };
