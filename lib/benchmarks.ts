// Market benchmarks for hot Instagram prospecting (coaching/consulting/
// infopreneur space) — not from an academic study or official body; these
// are order-of-magnitude figures aggregated from common experience in the
// coaching/infopreneur ecosystem (FR & US setting agencies, Hormozi/Schwartz-
// style frameworks). Always render as an indicative reference, never as a
// certified statistic — see BENCHMARK_DISCLAIMER below.

export const SECTOR_KEYS = [
  "coaching_b2b_high_ticket",
  "low_ticket_infoproduct",
  "ecommerce_dtc",
  "real_estate_finance",
] as const;

export type SectorKey = (typeof SECTOR_KEYS)[number];

export const SECTOR_LABELS: Record<SectorKey, string> = {
  coaching_b2b_high_ticket: "Coaching / consulting B2B haut ticket (2000-5000€)",
  low_ticket_infoproduct: "Low-ticket / infoproduit grand public (<100€)",
  ecommerce_dtc: "E-commerce / DTC",
  real_estate_finance: "Immobilier / patrimoine / finance personnelle avec appel",
};

export type BenchmarkBand = { bas: number; moyen: number; bon: number } | null;

type SectorBenchmark = {
  responseRate: BenchmarkBand;
  bookingRate: BenchmarkBand;
  showUpRate: BenchmarkBand;
  // Used by the Dashboard's KPI card comparison and its €-lost bottleneck
  // ranking (lib/dashboard/bottlenecks.ts) — previously missing even though
  // showUpRate (its sibling Closing-stage rate) already had a band.
  closingRate: BenchmarkBand;
  note: string;
};

export const GLOBAL_BENCHMARK: SectorBenchmark = {
  responseRate: { bas: 0.2, moyen: 0.4, bon: 0.6 },
  bookingRate: { bas: 0.15, moyen: 0.35, bon: 0.5 },
  showUpRate: { bas: 0.5, moyen: 0.7, bon: 0.8 },
  closingRate: { bas: 0.2, moyen: 0.3, bon: 0.4 },
  note: "Repère toutes prospections chaudes confondues, tous secteurs.",
};

export const SECTOR_BENCHMARKS: Record<SectorKey, SectorBenchmark> = {
  coaching_b2b_high_ticket: {
    responseRate: { bas: 0.25, moyen: 0.35, bon: 0.45 },
    bookingRate: { bas: 0.2, moyen: 0.3, bon: 0.4 },
    showUpRate: { bas: 0.55, moyen: 0.65, bon: 0.75 },
    closingRate: { bas: 0.25, moyen: 0.35, bon: 0.45 },
    note: "Le goulot d'étranglement principal est souvent le no-show, pas le booking. Une relance J-1 et J-0 avant l'appel améliore fortement ce taux.",
  },
  low_ticket_infoproduct: {
    responseRate: { bas: 0.35, moyen: 0.45, bon: 0.55 },
    bookingRate: { bas: 0.05, moyen: 0.1, bon: 0.15 },
    showUpRate: null,
    closingRate: null,
    note: "Le tunnel est souvent auto-liquidant sans appel (checkout direct). Le taux d'appel proposé est structurellement bas car peu pertinent pour ce ticket.",
  },
  ecommerce_dtc: {
    responseRate: { bas: 0.25, moyen: 0.3, bon: 0.35 },
    bookingRate: null,
    showUpRate: null,
    closingRate: null,
    note: "Canal peu adapté à la prise de rendez-vous téléphonique.",
  },
  real_estate_finance: {
    responseRate: { bas: 0.3, moyen: 0.35, bon: 0.45 },
    bookingRate: { bas: 0.2, moyen: 0.25, bon: 0.3 },
    showUpRate: { bas: 0.7, moyen: 0.77, bon: 0.85 },
    closingRate: { bas: 0.3, moyen: 0.4, bon: 0.5 },
    note: "Audience souvent déjà qualifiée financièrement, ce qui explique un show-up plus élevé que la moyenne.",
  },
};

export const BENCHMARK_DISCLAIMER =
  "Ces repères ne proviennent pas d'une étude académique ou d'un organisme officiel : il n'existe aucune base de données publique rigoureuse sur ce sujet. Ce sont des ordres de grandeur agrégés à partir de retours d'expérience courants dans l'écosystème coaching/infopreneuriat. À lire comme des repères indicatifs, jamais comme des statistiques certifiées.";

export function getBenchmark(sector: SectorKey | null | undefined): SectorBenchmark {
  return sector ? SECTOR_BENCHMARKS[sector] : GLOBAL_BENCHMARK;
}

export type BandComparison = "below" | "within" | "above" | null;

// null when either the rate itself or the sector's benchmark for it is
// unavailable — callers should skip the comparison entirely in that case.
export function compareToBand(value: number | null, band: BenchmarkBand): BandComparison {
  if (value === null || band === null) return null;
  if (value < band.bas) return "below";
  if (value >= band.bon) return "above";
  return "within";
}
