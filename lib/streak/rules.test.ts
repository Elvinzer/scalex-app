import { describe, expect, it } from "vitest";

import {
  computeStreak,
  computeWeeklyGoal,
  reachedMilestone,
  weekStart,
  weeklyProgress,
  type ActivityDay,
  type StreakState,
} from "./rules";

// 2026-08-09 is a Sunday; 2026-08-03 the Monday of its week.
const TODAY = "2026-08-09";

function days(...dates: string[]): ActivityDay[] {
  return dates.map((date) => ({ date, sources: ["content_published" as const] }));
}

const FRESH: StreakState = { current: 0, best: 0 };

describe("weekStart", () => {
  it("anchors weeks on Monday", () => {
    expect(weekStart("2026-08-09")).toBe("2026-08-03"); // Sunday -> its Monday
    expect(weekStart("2026-08-03")).toBe("2026-08-03");
    expect(weekStart("2026-08-04")).toBe("2026-08-03");
  });
});

describe("computeStreak", () => {
  it("counts consecutive active days up to today", () => {
    const result = computeStreak({
      activityDays: days("2026-08-07", "2026-08-08", "2026-08-09"),
      today: TODAY,
      state: FRESH,
      weeklyGoal: 6,
    });
    expect(result.current).toBe(3);
  });

  it("does not break the streak because today is not active yet", () => {
    // Mid-morning: yesterday counted, today hasn't happened. The flame has to
    // stay lit — resetting at midnight would punish the user for the clock.
    const result = computeStreak({
      activityDays: days("2026-08-06", "2026-08-07", "2026-08-08"),
      today: TODAY,
      state: { ...FRESH, current: 3 },
      weeklyGoal: 6,
    });
    expect(result.current).toBe(3);
    expect(result.brokenFrom).toBeNull();
  });

  it("spends a grace day to bridge a single missed day", () => {
    const result = computeStreak({
      activityDays: days("2026-08-05", "2026-08-06", "2026-08-08", "2026-08-09"), // 07 missing
      today: TODAY,
      state: FRESH,
      weeklyGoal: 6,
    });
    expect(result.graceDates).toEqual(["2026-08-07"]);
    // 4 real activity days; the graced day holds the chain together without
    // being counted as one.
    expect(result.current).toBe(4);
    expect(result.graceUsedMonth).toBe(1);
  });

  it("stops after the month's two grace days are spent", () => {
    const result = computeStreak({
      activityDays: days("2026-08-04", "2026-08-08", "2026-08-09"), // 05, 06, 07 missing
      today: TODAY,
      state: FRESH,
      weeklyGoal: 6,
    });
    // Two grace days cover the 7th and 6th; the 5th is uncoverable.
    expect(result.graceDates).toEqual(["2026-08-07", "2026-08-06"]);
    expect(result.current).toBe(2);
  });

  it("gives the same answer however many times it runs on the same data", () => {
    // The bug this pins down: feeding the previous run's grace count back in
    // as "already spent" made the same untouched gap cost a grace day on every
    // page render, and an intact 5-day streak collapsed to 2 after three
    // sidebar loads. Grace is derived from the activity, never accumulated.
    const activity = days("2026-08-05", "2026-08-06", "2026-08-08", "2026-08-09"); // 07 missing
    let state: StreakState = FRESH;

    const runs = Array.from({ length: 4 }, () => {
      const result = computeStreak({ activityDays: activity, today: TODAY, state, weeklyGoal: 6 });
      state = { current: result.current, best: result.best };
      return result;
    });

    expect(runs.map((run) => run.current)).toEqual([4, 4, 4, 4]);
    expect(runs.map((run) => run.graceUsedMonth)).toEqual([1, 1, 1, 1]);
    expect(runs.every((run) => run.brokenFrom === null)).toBe(true);
  });

  it("only ever counts grace days belonging to the current month", () => {
    // The gap sits in July while today is in August: covering it would let an
    // old month's allowance prop up this month's streak.
    const result = computeStreak({
      activityDays: days("2026-07-30", "2026-08-01"),
      today: "2026-08-02",
      state: FRESH,
      weeklyGoal: 6,
    });
    expect(result.graceDates).toEqual([]);
    expect(result.current).toBe(1);
  });

  it("lets a week that met its goal protect its own empty days, for free", () => {
    // 4 active days in the week of 03/08, goal 3 -> met. The two empty days
    // inside it cost neither the streak nor a grace day.
    const result = computeStreak({
      activityDays: days("2026-08-03", "2026-08-04", "2026-08-06", "2026-08-09"),
      today: TODAY,
      state: FRESH,
      weeklyGoal: 3,
    });
    expect(result.protectedDates).toContain("2026-08-08");
    expect(result.protectedDates).toContain("2026-08-07");
    expect(result.graceDates).toEqual([]);
    // The empty days cost nothing, but the streak still counts the 4 days
    // actually worked.
    expect(result.current).toBe(4);
  });

  it("reports the previous length when the streak actually breaks", () => {
    const result = computeStreak({
      activityDays: days("2026-08-01"),
      today: TODAY,
      state: { current: 12, best: 20 },
      weeklyGoal: 6,
    });
    expect(result.current).toBe(0);
    expect(result.brokenFrom).toBe(12);
    // A broken streak never lowers the personal best.
    expect(result.best).toBe(20);
  });

  it("never reports a streak built only from covered days", () => {
    // Last real activity eight days ago. Grace can bridge the last two days,
    // but there is no activity behind them to bridge TO.
    const result = computeStreak({
      activityDays: days("2026-08-01"),
      today: TODAY,
      state: FRESH,
      weeklyGoal: 6,
    });
    expect(result.current).toBe(0);
  });

  it("keeps the best when the current streak is shorter", () => {
    const result = computeStreak({
      activityDays: days("2026-08-08", "2026-08-09"),
      today: TODAY,
      state: { current: 2, best: 30 },
      weeklyGoal: 6,
    });
    expect(result.best).toBe(30);
  });

  it("returns zero without inventing a streak when there is no activity at all", () => {
    const result = computeStreak({ activityDays: [], today: TODAY, state: FRESH, weeklyGoal: 3 });
    expect(result.current).toBe(0);
    expect(result.brokenFrom).toBeNull(); // nothing was lost, so nothing to announce
  });
});

describe("computeWeeklyGoal", () => {
  it("sets the goal one notch above the user's own median rhythm", () => {
    // Weeks of 06/07, 13/07, 20/07, 27/07: 2, 2, 3, 5 activities -> median
    // 2.5 -> round 3 -> +1 = 4.
    const activity = days(
      "2026-07-06", "2026-07-08",
      "2026-07-13", "2026-07-15",
      "2026-07-20", "2026-07-22", "2026-07-24",
      "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31"
    );
    expect(computeWeeklyGoal(activity, TODAY)).toBe(4);
  });

  it("never drops below 3 for a brand-new account", () => {
    expect(computeWeeklyGoal([], TODAY)).toBe(3);
  });

  it("caps at 6 however intense the last month was", () => {
    const everyDay: ActivityDay[] = [];
    for (let offset = 1; offset <= 28; offset += 1) {
      const date = new Date("2026-08-03T00:00:00.000Z");
      date.setUTCDate(date.getUTCDate() - offset);
      everyDay.push({ date: date.toISOString().slice(0, 10), sources: ["content_published"] });
    }
    expect(computeWeeklyGoal(everyDay, TODAY)).toBe(6);
  });

  it("ignores the current week, which is still in progress", () => {
    // A blazing current week must not raise the bar mid-week.
    const activity = days("2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06", "2026-08-07");
    expect(computeWeeklyGoal(activity, TODAY)).toBe(3);
  });
});

describe("weeklyProgress", () => {
  it("counts only the days of the current week", () => {
    const progress = weeklyProgress(days("2026-08-02", "2026-08-03", "2026-08-09"), TODAY);
    expect(progress.weekStartIso).toBe("2026-08-03");
    expect(progress.done).toBe(2);
  });
});

describe("reachedMilestone", () => {
  it("fires once per threshold", () => {
    expect(reachedMilestone(7, 0)).toBe(7);
    expect(reachedMilestone(9, 7)).toBeNull();
    expect(reachedMilestone(14, 7)).toBe(14);
  });

  it("returns the highest threshold crossed when several land at once", () => {
    expect(reachedMilestone(30, 0)).toBe(30);
  });

  it("stays silent below the first threshold", () => {
    expect(reachedMilestone(6, 0)).toBeNull();
  });
});
