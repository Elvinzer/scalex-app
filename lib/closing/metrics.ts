import type { closingKpiEntries } from "@/db/schema";
import { rate } from "@/lib/setting/funnel";

type ClosingKpiEntry = typeof closingKpiEntries.$inferSelect;

export type ClosingTotals = {
  callsAttended: number;
  salesClosed: number;
};

export function aggregateClosingEntries(entries: ClosingKpiEntry[]): ClosingTotals {
  return entries.reduce<ClosingTotals>(
    (totals, entry) => ({
      callsAttended: totals.callsAttended + entry.callsAttended,
      salesClosed: totals.salesClosed + entry.salesClosed,
    }),
    { callsAttended: 0, salesClosed: 0 }
  );
}

export type ClosingRates = {
  closingRate: number | null;
  noShowRate: number | null;
  // Same underlying ratio as noShowRate, inverted (higher = better) — kept
  // alongside it because the market benchmark is framed as "show-up rate",
  // and the bottleneck/benchmark comparisons below need a higher-is-better
  // scale to stay consistent with lib/setting/funnel.ts's convention.
  showUpRate: number | null;
};

// callsBooked comes from settingKpiEntries (a different table), summed over
// the same period — not part of ClosingTotals since it isn't closing's own data.
export function computeClosingRates(totals: ClosingTotals, callsBooked: number): ClosingRates {
  // Capped so a mismatch between the two tables' periods (attended >
  // booked) can't push either rate outside [0, 1].
  const attendedCapped = Math.min(totals.callsAttended, callsBooked);

  return {
    closingRate: rate(totals.salesClosed, totals.callsAttended),
    showUpRate: rate(attendedCapped, callsBooked),
    noShowRate: rate(callsBooked - attendedCapped, callsBooked),
  };
}

export type ClosingStage = "showUpRate" | "closingRate";

export const CLOSING_STAGE_LABELS: Record<ClosingStage, string> = {
  showUpRate: "Taux de présence à l'appel (show-up)",
  closingRate: "Taux de closing",
};

export const CLOSING_STAGE_TIPS: Record<ClosingStage, string> = {
  showUpRate:
    "Une partie de tes appels réservés ne se concrétise pas : une relance la veille et le jour même de l'appel améliore fortement ce taux.",
  closingRate:
    "Des appels ont bien lieu mais ne se transforment pas en vente : retravaille ton script de closing ou la qualification faite en amont de l'appel.",
};

export type ClosingBottleneck = { stage: ClosingStage; rate: number };

// Mirrors lib/setting/funnel.ts's findBottleneck (lowest higher-is-better
// rate wins) — kept as its own small function rather than a shared generic,
// since the two features' rate shapes differ and there are only two call sites.
export function findClosingBottleneck(rates: ClosingRates): ClosingBottleneck | null {
  let worst: ClosingBottleneck | null = null;
  for (const stage of ["showUpRate", "closingRate"] as ClosingStage[]) {
    const value = rates[stage];
    if (value === null) continue;
    if (worst === null || value < worst.rate) {
      worst = { stage, rate: value };
    }
  }
  return worst;
}
