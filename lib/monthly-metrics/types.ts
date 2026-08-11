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
  // Counts that only exist for some acquisition journeys. Kept separate from
  // the legacy scalar columns so changing journey never deletes history.
  acquisitionMetrics?: Record<string, number | null>;
};

export type MonthlyMetricScalarKey = Exclude<keyof MonthlyMetricsInput, "acquisitionMetrics">;

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
  acquisitionMetrics: {},
};

export const MONTHLY_METRICS_FIELDS = [
  "cashCollected",
  "cashContracted",
  "newFollowers",
  "firstMessages",
  "conversations",
  "callsProposed",
  "callsBooked",
  "callsTaken",
  "salesClosed",
] as const satisfies readonly (keyof MonthlyMetricsInput)[];

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
