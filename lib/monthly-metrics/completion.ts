import { MONTHLY_METRICS_FIELDS, type MonthlyMetricsInput } from "./types";

export type MonthCompletion = { count: number; total: number };

export function computeCompletion(data: MonthlyMetricsInput): MonthCompletion {
  const count = MONTHLY_METRICS_FIELDS.filter((field) => data[field] !== null).length;
  return { count, total: MONTHLY_METRICS_FIELDS.length };
}

export type MonthStatus = "empty" | "partial" | "complete";

export function monthStatus(completion: MonthCompletion): MonthStatus {
  if (completion.count === 0) return "empty";
  if (completion.count === completion.total) return "complete";
  return "partial";
}
