import { MONTHLY_METRICS_FIELDS, type MonthlyMetricsInput } from "./types";

export type MonthCompletion = { count: number; total: number };

const INPUT_KEY_BY_FIELD: Record<(typeof MONTHLY_METRICS_FIELDS)[number], string> = {
  cashCollected: "cash_collected",
  cashContracted: "cash_contracted",
  newFollowers: "new_followers",
  firstMessages: "first_messages",
  conversations: "conversations",
  callsProposed: "calls_proposed",
  callsBooked: "calls_booked",
  callsTaken: "calls_attended",
  salesClosed: "sales_closed",
};

export function computeCompletion(data: MonthlyMetricsInput, activeInputKeys?: ReadonlySet<string>): MonthCompletion {
  const fields = activeInputKeys
    ? MONTHLY_METRICS_FIELDS.filter((field) => field === "cashCollected" || field === "cashContracted" || activeInputKeys.has(INPUT_KEY_BY_FIELD[field]))
    : MONTHLY_METRICS_FIELDS;
  const customKeys = activeInputKeys
    ? Array.from(activeInputKeys).filter((key) => !Object.values(INPUT_KEY_BY_FIELD).includes(key))
    : [];
  const count = fields.filter((field) => data[field] !== null).length + customKeys.filter((key) => data.acquisitionMetrics?.[key] !== null && data.acquisitionMetrics?.[key] !== undefined).length;
  return { count, total: fields.length + customKeys.length };
}

export type MonthStatus = "empty" | "partial" | "complete";

export function monthStatus(completion: MonthCompletion): MonthStatus {
  if (completion.count === 0) return "empty";
  if (completion.count === completion.total) return "complete";
  return "partial";
}
