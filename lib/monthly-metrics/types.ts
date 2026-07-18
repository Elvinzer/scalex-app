// Flat shape mirroring db/schema.ts's monthlyMetrics columns — not nested
// jsonb like business_profile, since these are plain scalar Drizzle columns.
// Every field null = not entered (never coerced to 0).
export type MonthlyMetricsInput = {
  cashCollected: number | null;
  cashContracted: number | null;
  newFollowers: number | null;
  firstMessages: number | null;
  conversations: number | null;
  callsProposed: number | null;
  callsBooked: number | null;
  callsTaken: number | null;
  salesClosed: number | null;
};

export const EMPTY_MONTHLY_METRICS: MonthlyMetricsInput = {
  cashCollected: null,
  cashContracted: null,
  newFollowers: null,
  firstMessages: null,
  conversations: null,
  callsProposed: null,
  callsBooked: null,
  callsTaken: null,
  salesClosed: null,
};

export const MONTHLY_METRICS_FIELDS = Object.keys(EMPTY_MONTHLY_METRICS) as (keyof MonthlyMetricsInput)[];

export const MONTH_LABELS = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];
