import type { getBenchmark } from "@/lib/benchmarks";
import { formatEur } from "@/lib/currency";
import type { ClosingRates, ClosingTotals } from "@/lib/closing/metrics";
import type { FunnelRates, FunnelTotals } from "@/lib/setting/funnel";
import { STAGE_LABELS } from "@/lib/setting/funnel";
import { CLOSING_STAGE_LABELS } from "@/lib/closing/metrics";

// Only stages with both a rate and a sector benchmark band can ever produce
// a computable € figure — lib/benchmarks.ts only covers these 4 (outreachRate
// and proposalRate have no benchmark band, so they're never rankable here).
type BottleneckKey = "responseRate" | "bookingRate" | "showUpRate" | "closingRate";

const STAGE_META: Record<BottleneckKey, { source: "setting" | "closing"; category: "Acquisition" | "Vente" }> = {
  responseRate: { source: "setting", category: "Acquisition" },
  bookingRate: { source: "setting", category: "Acquisition" },
  showUpRate: { source: "closing", category: "Vente" },
  closingRate: { source: "closing", category: "Vente" },
};

export type DashboardBottleneck = {
  key: BottleneckKey;
  category: "Acquisition" | "Vente";
  label: string;
  currentRatePercent: number;
  benchmarkRatePercent: number;
  estimatedMonthlyLoss: number;
  explanation: string;
  tooltip: string;
};

function pct(value: number): number {
  return Math.round(value * 100);
}

function label(key: BottleneckKey): string {
  return key === "showUpRate" || key === "closingRate" ? CLOSING_STAGE_LABELS[key] : STAGE_LABELS[key];
}

export function computeDashboardBottlenecks({
  settingTotals,
  settingRates,
  closingTotals,
  closingRates,
  benchmark,
  mainOfferPrice,
}: {
  settingTotals: FunnelTotals;
  settingRates: FunnelRates;
  closingTotals: ClosingTotals;
  closingRates: ClosingRates;
  benchmark: ReturnType<typeof getBenchmark>;
  mainOfferPrice: number | null;
}): DashboardBottleneck[] {
  if (!mainOfferPrice || mainOfferPrice <= 0) return [];

  const candidates: DashboardBottleneck[] = [];

  const volumeFor = (key: BottleneckKey): number => {
    switch (key) {
      case "responseRate":
        return settingTotals.firstMessagesSent;
      case "bookingRate":
        return settingTotals.callsProposed;
      case "showUpRate":
        return settingTotals.callsBooked;
      case "closingRate":
        return closingTotals.callsAttended;
    }
  };

  const rateFor = (key: BottleneckKey): number | null => {
    if (STAGE_META[key].source === "setting") return settingRates[key as "responseRate" | "bookingRate"];
    return closingRates[key as "showUpRate" | "closingRate"];
  };

  for (const key of Object.keys(STAGE_META) as BottleneckKey[]) {
    const currentRate = rateFor(key);
    const band = benchmark[key];
    const volume = volumeFor(key);

    if (currentRate === null || band === null || volume <= 0) continue;
    if (currentRate >= band.bon) continue; // already at/above benchmark, nothing to fix

    const gap = band.bon - currentRate;
    const estimatedMonthlyLoss = gap * volume * mainOfferPrice;
    if (estimatedMonthlyLoss <= 0) continue;

    candidates.push({
      key,
      category: STAGE_META[key].category,
      label: label(key),
      currentRatePercent: pct(currentRate),
      benchmarkRatePercent: pct(band.bon),
      estimatedMonthlyLoss,
      explanation: `${label(key)} : ${pct(currentRate)}% actuellement, benchmark ${pct(band.bon)}%.`,
      tooltip: `(${pct(band.bon)}% − ${pct(currentRate)}%) × ${volume} × ${formatEur(mainOfferPrice)}`,
    });
  }

  return candidates.sort((a, b) => b.estimatedMonthlyLoss - a.estimatedMonthlyLoss).slice(0, 3);
}

// What's blocking a fuller/more accurate priority list — shown as a filler
// card when fewer than 3 bottlenecks are computable.
export function getBottleneckUnlockHints({
  mainOfferPrice,
  hasSettingEntries,
  hasClosingEntries,
}: {
  mainOfferPrice: number | null;
  hasSettingEntries: boolean;
  hasClosingEntries: boolean;
}): string[] {
  const hints: string[] = [];
  if (!mainOfferPrice || mainOfferPrice <= 0) {
    hints.push("Renseigne ton offre principale dans Mon business");
  }
  if (!hasSettingEntries || !hasClosingEntries) {
    hints.push("Fais ton premier check-in dans Funnel");
  }
  return hints;
}
