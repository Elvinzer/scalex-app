// Pure type/const, deliberately in its own file with zero server-only
// imports (no "@/db") — lib/diagnostic/benchmarks.ts needs `db` for
// getDiagnosticBenchmarks, and anything importing a runtime value (not just
// a type) from that file bundles its whole module graph, including
// postgres-js — which breaks client components that only need this list
// (e.g. app/(app)/diagnostic/auto-open-improve.tsx). Import from here, not
// from benchmarks.ts, whenever a client component needs these.
export type MetricKey = "responseRate" | "proposalRate" | "bookingRate" | "showUpRate" | "closingRate";

export const METRIC_KEYS: MetricKey[] = [
  "responseRate",
  "proposalRate",
  "bookingRate",
  "showUpRate",
  "closingRate",
];
