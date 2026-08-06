// Pure attribution rules — deliberately free of any DB/server import so the
// guardrails below stay unit-testable in isolation (same split rationale as
// lib/diagnostic/metric-keys.ts). DB access lives in ./attribution.ts.

export type AttributionMethod = "declared" | "estimated";

// Minimum number of DECLARED attributions before any € figure is shown.
// Below it the ranking would be one lucky sale masquerading as a trend —
// the spec's "grisé : pas assez de données d'attribution pour chiffrer".
// Estimated attributions deliberately do NOT count toward this gate: they
// can never, on their own, unlock a euro amount.
export const MIN_DECLARED_ATTRIBUTIONS_FOR_EUROS = 5;

export type VideoAttributionTotals = {
  videoId: string;
  declaredSales: number;
  estimatedSales: number;
  declaredRevenueEur: number;
  estimatedRevenueEur: number;
};

export type AttributionReliability = {
  declaredCount: number;
  estimatedCount: number;
  // False -> the UI greys out every € figure and says why.
  canShowEuros: boolean;
  // How many more declared attributions are needed to unlock € figures.
  missingForEuros: number;
};

export function computeReliability(totals: Map<string, VideoAttributionTotals>): AttributionReliability {
  let declaredCount = 0;
  let estimatedCount = 0;
  for (const entry of totals.values()) {
    declaredCount += entry.declaredSales;
    estimatedCount += entry.estimatedSales;
  }
  return {
    declaredCount,
    estimatedCount,
    canShowEuros: declaredCount >= MIN_DECLARED_ATTRIBUTIONS_FOR_EUROS,
    missingForEuros: Math.max(0, MIN_DECLARED_ATTRIBUTIONS_FOR_EUROS - declaredCount),
  };
}

// Clients per 1 000 views — the conversion figure that makes a small video
// with real buyers beat a viral one with none. Null below the view floor:
// a 40-view video with one sale would read as 25 clients/1 000, which is
// arithmetic, not a signal.
const MIN_VIEWS_FOR_CONVERSION = 500;

export function conversionPerThousandViews(views: number | null, attributedSales: number): number | null {
  if (views === null || views < MIN_VIEWS_FOR_CONVERSION) return null;
  return (attributedSales / views) * 1000;
}
