// Plain types for the weekly_reports jsonb columns (db/schema.ts) — kept
// import-free from db/schema.ts itself (same role as lib/sales/types.ts),
// so both db/schema.ts and lib/dashboard/weekly-report.ts can import from
// here without a circular dependency.

export type WeeklyReportStatCard = {
  key: "ca_contracte" | "nouveaux_clients" | "leads" | "rdv" | "closing_rate";
  label: string;
  valueLabel: string;
  deltaLabel: string | null;
  deltaDirection: "up" | "down" | null;
};

export type WeeklyReportBottleneck = {
  metricKey: string;
  label: string;
  currentRatePercent: number;
  benchmarkRatePercent: number;
  // Aggregate monthly potential captured in this report. The label and rates
  // still identify the primary bottleneck, while this amount also includes
  // the other chiffrable improvements available at generation time.
  monthlyGain: number;
};
