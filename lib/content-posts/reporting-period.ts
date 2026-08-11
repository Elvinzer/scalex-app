import { inRange } from "@/lib/dashboard/metrics";
import { monthWindowFor, type MonthWindow } from "@/lib/diagnostic/completed-months";

type DatedContentPost = { publishedAt: string };

/**
 * Content platforms expose per-post totals, not a month-by-month time series.
 * Keep the Dashboard useful after an initial sync: prefer the current month,
 * then fall back to the most recent month that actually contains imported
 * content instead of replacing a real Instagram audience with "—".
 */
export function resolveContentReportingMonth(
  posts: readonly DatedContentPost[],
  currentMonth: MonthWindow,
): MonthWindow {
  if (posts.some((post) => inRange(post.publishedAt, currentMonth.range))) return currentMonth;

  const latestPost = posts.reduce<DatedContentPost | null>((latest, post) => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(post.publishedAt)) return latest;
    return latest === null || post.publishedAt > latest.publishedAt ? post : latest;
  }, null);

  if (latestPost === null) return currentMonth;

  const year = Number(latestPost.publishedAt.slice(0, 4));
  const month = Number(latestPost.publishedAt.slice(5, 7));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) return currentMonth;

  return monthWindowFor(year, month);
}

/**
 * A content snapshot can be useful on its own even when it is the latest
 * imported month. It must not, however, be used as the first stage of a
 * funnel whose other metrics belong to a different month.
 */
export function isSameReportingMonth(left: MonthWindow, right: MonthWindow): boolean {
  return left.year === right.year && left.month === right.month;
}
