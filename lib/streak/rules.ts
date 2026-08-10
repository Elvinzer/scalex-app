import type { ActivitySource } from "./sources";

// The whole streak mechanic, with no database import — every rule in §C of
// the brief is a pure function of "which days were active" plus the stored
// grace/goal state, so it can be tested exhaustively. Nothing here formats
// copy or decides what to celebrate; that lives in ./service.ts and the UI.

export type ActivityDay = { date: string; sources: ActivitySource[] };

// Bounds from §B. The goal is deliberately reachable: one activity a day for
// six days is already an intense rhythm for a solo coach, and three is the
// floor precisely so a heavy week stays winnable.
export const MIN_WEEKLY_GOAL = 3;
export const MAX_WEEKLY_GOAL = 6;
export const GRACE_DAYS_PER_MONTH = 2;
export const MILESTONES = [7, 14, 30, 60, 100] as const;

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = toDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return toIso(date);
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

// Monday-based, matching lib/dashboard/metrics.ts's currentIsoWeekRange so
// "this week" means the same thing everywhere in the product.
export function weekStart(iso: string): string {
  const date = toDate(iso);
  const weekday = (date.getUTCDay() + 6) % 7; // 0 = Monday
  return addDays(iso, -weekday);
}

export function daysBetween(fromIso: string, toIsoDate: string): number {
  return Math.round((toDate(toIsoDate).getTime() - toDate(fromIso).getTime()) / 86_400_000);
}

export type StreakState = {
  current: number;
  best: number;
};

export type StreakComputation = {
  current: number;
  best: number;
  graceUsedMonth: number;
  graceMonth: string;
  // Days the walk-back covered with a grace day rather than an activity —
  // shown as outlined cells in the modal's calendar, never as a failure.
  graceDates: string[];
  // Missed days absorbed because their week had already met its goal. §B's
  // "la régularité hebdo prime sur le quotidien strict".
  protectedDates: string[];
  brokenFrom: number | null; // previous length when the streak just broke, for tracking
};

function countActivitiesInWeek(activeDates: Set<string>, weekStartIso: string): number {
  let count = 0;
  for (let offset = 0; offset < 7; offset += 1) {
    if (activeDates.has(addDays(weekStartIso, offset))) count += 1;
  }
  return count;
}

// A week that hit its goal shields every day inside it. Computed per week and
// memoised because the walk-back below asks the same question repeatedly.
function buildProtectedWeeks(activeDates: Set<string>, weeklyGoal: number): (weekStartIso: string) => boolean {
  const cache = new Map<string, boolean>();
  return (weekStartIso: string) => {
    const cached = cache.get(weekStartIso);
    if (cached !== undefined) return cached;
    const met = countActivitiesInWeek(activeDates, weekStartIso) >= weeklyGoal;
    cache.set(weekStartIso, met);
    return met;
  };
}

// Walks backwards from `today`, spending grace days and week protection to
// bridge gaps, and stops at the first gap it cannot cover.
//
// Today itself never breaks a streak: a day that is still in progress is not
// a missed day. The walk therefore starts at today when it is active, and at
// yesterday otherwise — this is what keeps the flame lit all morning instead
// of resetting it at midnight and re-lighting it after the first action.
export function computeStreak({
  activityDays,
  today,
  state,
  weeklyGoal,
}: {
  activityDays: ActivityDay[];
  today: string;
  state: StreakState;
  weeklyGoal: number;
}): StreakComputation {
  const activeDates = new Set(activityDays.map((day) => day.date));
  const currentMonth = monthKey(today);
  // The allowance is DERIVED on every computation, never carried forward from
  // the stored counter. Subtracting an already-stored count here would drain
  // the budget on every page load: the same untouched gap would cost a grace
  // day each time the sidebar rendered, and a perfectly intact 5-day streak
  // collapsed to 2 after three refreshes. The walk below re-decides which days
  // are covered from the activity alone, so running it twice gives the same
  // answer — which is the only property that makes it safe to call from a
  // render path.
  let graceRemaining = GRACE_DAYS_PER_MONTH;

  const isWeekProtected = buildProtectedWeeks(activeDates, weeklyGoal);
  const graceDates: string[] = [];
  const protectedDates: string[] = [];
  // Oldest day the user was ever active. Bridging (grace or week protection)
  // may only ever CONNECT two active days — never extend the streak backwards
  // past its own beginning. Without this, a brand-new account with three
  // active days would be handed a 5-day streak by spending its two grace days
  // on empty history.
  const earliestActive = activityDays.length > 0 ? activityDays.reduce((min, day) => (day.date < min ? day.date : min), activityDays[0].date) : null;

  let cursor = activeDates.has(today) ? today : addDays(today, -1);
  let current = 0;

  // Bounded walk: 3 years is far past any streak this product will see, and
  // it guarantees termination whatever the data looks like.
  for (let step = 0; step < 1100; step += 1) {
    if (activeDates.has(cursor)) {
      current += 1;
      cursor = addDays(cursor, -1);
      continue;
    }

    if (earliestActive === null || cursor <= earliestActive) break;

    // An inactive day inside a week that already met its goal costs nothing:
    // it is not a miss, it is a rest day the user earned.
    //
    // Covered days PRESERVE the streak without lengthening it — only real
    // activity increments the counter. Letting them increment made a streak
    // that could be composed entirely of covered days: an account whose last
    // activity was eight days ago displayed "2 jours" built from two grace
    // days and nothing else. A number nobody earned is worse than a zero.
    if (isWeekProtected(weekStart(cursor))) {
      protectedDates.push(cursor);
      cursor = addDays(cursor, -1);
      continue;
    }

    // Grace days only ever cover days in the CURRENT month's allowance —
    // spending them on an old gap would silently resurrect a long-dead
    // streak the next time the page loads.
    if (graceRemaining > 0 && monthKey(cursor) === currentMonth) {
      graceRemaining -= 1;
      graceDates.push(cursor);
      cursor = addDays(cursor, -1);
      continue;
    }

    break;
  }

  const brokenFrom = current === 0 && state.current > 0 ? state.current : null;

  return {
    current,
    best: Math.max(state.best, current),
    // How many grace days the CURRENT streak rests on this month — a readout
    // ("il te reste X jours de grâce"), not a ledger. graceDates only ever
    // holds days in the current month (see the guard above).
    graceUsedMonth: graceDates.length,
    graceMonth: currentMonth,
    graceDates,
    protectedDates,
    brokenFrom,
  };
}

// §B: median of the last 4 completed weeks' activity counts, +1, clamped.
// Median and not mean so one exceptional launch week doesn't set a bar the
// user then fails every week after.
export function computeWeeklyGoal(activityDays: ActivityDay[], today: string): number {
  const activeDates = new Set(activityDays.map((day) => day.date));
  const thisWeekStart = weekStart(today);

  const counts: number[] = [];
  for (let week = 1; week <= 4; week += 1) {
    counts.push(countActivitiesInWeek(activeDates, addDays(thisWeekStart, -7 * week)));
  }

  counts.sort((a, b) => a - b);
  const median = (counts[1] + counts[2]) / 2; // 4 values: average of the middle pair

  return Math.min(MAX_WEEKLY_GOAL, Math.max(MIN_WEEKLY_GOAL, Math.round(median) + 1));
}

export function weeklyProgress(activityDays: ActivityDay[], today: string): { done: number; weekStartIso: string } {
  const activeDates = new Set(activityDays.map((day) => day.date));
  const weekStartIso = weekStart(today);
  return { done: countActivitiesInWeek(activeDates, weekStartIso), weekStartIso };
}

// Highest milestone newly reached, or null. Compared against what was already
// celebrated so the confetti fires once per threshold — and never on the way
// back down (a rebuilt streak passing 7 again is a real milestone, which is
// why ./service.ts resets lastMilestoneCelebrated when the streak breaks).
export function reachedMilestone(current: number, lastCelebrated: number): number | null {
  const reached = MILESTONES.filter((milestone) => current >= milestone && milestone > lastCelebrated);
  return reached.length > 0 ? reached[reached.length - 1] : null;
}
