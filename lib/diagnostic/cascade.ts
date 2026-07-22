import type { ClosingTotals } from "@/lib/closing/metrics";
import { computeClosingRates } from "@/lib/closing/metrics";
import { computeFunnelRates, STAGE_LABELS, type FunnelTotals } from "@/lib/setting/funnel";
import { CLOSING_STAGE_LABELS } from "@/lib/closing/metrics";
import type { BusinessProfileData } from "@/lib/business/types";

// Deliberately from ./metric-keys, not ./benchmarks — the latter imports
// "@/db" for getDiagnosticBenchmarks, which would otherwise get bundled
// into any client component that imports labelFor/categoryFor from this
// file (see app/(app)/diagnostic/auto-open-improve.tsx).
import { METRIC_KEYS, type MetricKey } from "./metric-keys";

// The order the spec's cascade actually flows in: firstMessagesSent is the
// top of the funnel here — outreachRate (subscribers -> messages) has no
// benchmark in the spec's table, so it isn't part of the simulation.
const CASCADE_ORDER: MetricKey[] = ["responseRate", "proposalRate", "bookingRate", "showUpRate", "closingRate"];

const MIN_VOLUME = 30;
const CAUTION_THRESHOLD = 0.2; // relative gap below which a sub-benchmark rate is "caution" not "critical"

export type MetricStatus = "ok" | "caution" | "critical" | "unmeasured";

// Exported for lib/diagnostic/onboarding-goulot.ts's relaxed-volume fallback.
export function labelFor(key: MetricKey): string {
  return key === "showUpRate" || key === "closingRate" ? CLOSING_STAGE_LABELS[key] : STAGE_LABELS[key];
}

export function categoryFor(key: MetricKey): "Setting" | "Closing" {
  return key === "showUpRate" || key === "closingRate" ? "Closing" : "Setting";
}

function volumeFor(key: MetricKey, settingTotals: FunnelTotals, closingTotals: ClosingTotals): number {
  switch (key) {
    case "responseRate":
      return settingTotals.firstMessagesSent;
    case "proposalRate":
      return settingTotals.conversationsStarted;
    case "bookingRate":
      return settingTotals.callsProposed;
    case "showUpRate":
      return settingTotals.callsBooked;
    case "closingRate":
      return closingTotals.callsAttended;
  }
}

export function computeMetricStatus(current: number | null, benchmark: number, volume: number): MetricStatus {
  if (current === null || volume < MIN_VOLUME) return "unmeasured";
  if (current >= benchmark) return "ok";
  const relativeGap = (benchmark - current) / benchmark;
  return relativeGap < CAUTION_THRESHOLD ? "caution" : "critical";
}

// Multiplies messagesSent through the 5 benchmarked stages in order, using
// `overrides[key]` in place of the real rate where provided. Returns null if
// any stage along the way (real or overridden) is unmeasured — never
// fabricates a number by treating an unmeasured stage as 0 or 100%.
export function simulateSales(
  messagesSent: number,
  rates: Record<MetricKey, number | null>,
  overrides: Partial<Record<MetricKey, number>> = {}
): number | null {
  let volume = messagesSent;
  for (const key of CASCADE_ORDER) {
    const r = overrides[key] ?? rates[key];
    if (r === null || r === undefined) return null;
    volume *= r;
  }
  return volume;
}

export type DealPrice = { price: number | null; isFallback: boolean; offerName: string | null };

// Main offer price wins; falls back to real average deal size (contracted
// cash / sales closed) only when no main offer is set, per spec — flagged
// so the UI can show the "panier moyen" tooltip instead of presenting it as
// the offer price.
export function resolveDealPrice(
  businessProfile: BusinessProfileData,
  closingTotals: ClosingTotals,
  cashContractedTotal: number
): DealPrice {
  const mainOffer = businessProfile.sales.offers.find((offer) => offer.isMain);
  if (mainOffer?.price) {
    return { price: mainOffer.price, isFallback: false, offerName: mainOffer.name || null };
  }
  if (closingTotals.salesClosed > 0 && cashContractedTotal > 0) {
    return { price: cashContractedTotal / closingTotals.salesClosed, isFallback: true, offerName: null };
  }
  return { price: null, isFallback: false, offerName: null };
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// Shared by computeDiagnosticPoints and computeMetricHealthCards — both need
// "what would sales look like if this one metric hit its benchmark," never
// re-derive it independently.
function gainForKey(
  key: MetricKey,
  benchmark: number,
  rates: Record<MetricKey, number | null>,
  messagesSent: number,
  realSales: number | null,
  dealPrice: DealPrice
): { extraClients: number; monthlyGain: number | null; simulatedSales: number | null } {
  const simulatedSales = simulateSales(messagesSent, rates, { [key]: benchmark });
  const extraClients = realSales !== null && simulatedSales !== null ? round1(simulatedSales - realSales) : 0;
  const monthlyGain = dealPrice.price !== null ? Math.round(extraClients * dealPrice.price) : null;
  return { extraClients, monthlyGain, simulatedSales };
}

export type DiagnosticPoint = {
  key: MetricKey;
  category: "Setting" | "Closing";
  label: string;
  status: "caution" | "critical";
  currentRatePercent: number;
  benchmarkRatePercent: number;
  extraClients: number;
  monthlyGain: number | null;
  yearlyGain: number | null;
  isPriceFallback: boolean;
  explanation: string;
  tooltip: string;
};

function explanationFor(key: MetricKey, currentPct: number, benchmarkPct: number, immediateGain: number): string {
  switch (key) {
    case "responseRate":
      return `${currentPct}% de tes messages reçoivent une réponse. Le benchmark de ta niche est à ${benchmarkPct}%. En l'atteignant, tu obtiens ${immediateGain} conversations de plus par mois.`;
    case "proposalRate":
      return `${currentPct}% de tes conversations débouchent sur une proposition d'appel. Le benchmark est à ${benchmarkPct}%. À ce niveau, tu proposes ${immediateGain} appels de plus par mois.`;
    case "bookingRate":
      return `${currentPct}% de tes appels proposés sont réservés. Le benchmark est à ${benchmarkPct}%. En le rejoignant, tu réserves ${immediateGain} appels de plus par mois.`;
    case "showUpRate":
      return `${100 - currentPct}% de tes appels réservés ne se présentent pas. Le benchmark est à ${100 - benchmarkPct}% de no-show. En ramenant ça au standard, tu prends ${immediateGain} appels de plus par mois.`;
    case "closingRate":
      return `${currentPct}% de tes appels pris se transforment en vente. Le benchmark est à ${benchmarkPct}%. En l'atteignant, tu closes ${immediateGain} ventes de plus par mois.`;
  }
}

// Exported for lib/improve-chat-tracking.ts, which snapshots a single
// metric's current rate when the "Améliorer" chat opens on it (for the
// weekly check-in's before/after comparison) — reuses this instead of
// re-deriving the field-to-MetricKey mapping.
export function buildRates(settingTotals: FunnelTotals, closingTotals: ClosingTotals): Record<MetricKey, number | null> {
  const settingRates = computeFunnelRates(settingTotals);
  const closingRates = computeClosingRates(closingTotals, settingTotals.callsBooked);
  return {
    responseRate: settingRates.responseRate,
    proposalRate: settingRates.proposalRate,
    bookingRate: settingRates.bookingRate,
    showUpRate: closingRates.showUpRate,
    closingRate: closingRates.closingRate,
  };
}

export type MetricSummary = {
  key: MetricKey;
  category: "Setting" | "Closing";
  label: string;
  status: MetricStatus;
  currentRatePercent: number | null;
  benchmarkRatePercent: number;
};

// Bloc 3's full grid — every metric regardless of status (unlike
// computeDiagnosticPoints, which only returns caution/critical points).
export function computeMetricSummaries({
  settingTotals,
  closingTotals,
  benchmarks,
}: {
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  benchmarks: Record<MetricKey, number>;
}): MetricSummary[] {
  const rates = buildRates(settingTotals, closingTotals);

  return METRIC_KEYS.map((key) => {
    const current = rates[key];
    const benchmark = benchmarks[key];
    const volume = volumeFor(key, settingTotals, closingTotals);
    const status = computeMetricStatus(current, benchmark, volume);

    return {
      key,
      category: categoryFor(key),
      label: labelFor(key),
      status,
      currentRatePercent: current === null ? null : Math.round(current * 100),
      benchmarkRatePercent: Math.round(benchmark * 100),
    };
  });
}

export function computeDiagnosticPoints({
  settingTotals,
  closingTotals,
  benchmarks,
  businessProfile,
  cashContractedTotal,
}: {
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  benchmarks: Record<MetricKey, number>;
  businessProfile: BusinessProfileData;
  cashContractedTotal: number;
}): DiagnosticPoint[] {
  const rates = buildRates(settingTotals, closingTotals);

  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const messagesSent = settingTotals.firstMessagesSent;
  const realSales = simulateSales(messagesSent, rates);

  const points: DiagnosticPoint[] = [];

  for (const key of METRIC_KEYS) {
    const current = rates[key];
    const benchmark = benchmarks[key];
    const volume = volumeFor(key, settingTotals, closingTotals);
    const status = computeMetricStatus(current, benchmark, volume);
    if (status !== "caution" && status !== "critical") continue;
    // current, volume are non-null/large-enough here (status check guarantees it)

    const { extraClients, monthlyGain, simulatedSales } = gainForKey(key, benchmark, rates, messagesSent, realSales, dealPrice);
    const mainOffer = businessProfile.sales.offers.find((offer) => offer.isMain);
    const yearlyGain = monthlyGain !== null && mainOffer?.recurrence === "mensuel" ? monthlyGain * 12 : null;

    const immediateGain = Math.round((benchmark - (current as number)) * volume);
    const currentPct = Math.round((current as number) * 100);
    const benchmarkPct = Math.round(benchmark * 100);

    points.push({
      key,
      category: categoryFor(key),
      label: labelFor(key),
      status,
      currentRatePercent: currentPct,
      benchmarkRatePercent: benchmarkPct,
      extraClients,
      monthlyGain,
      yearlyGain,
      isPriceFallback: dealPrice.isFallback,
      explanation: explanationFor(key, currentPct, benchmarkPct, Math.max(immediateGain, 0)),
      tooltip: `${Math.round(messagesSent)} messages × ${CASCADE_ORDER.map((k) => `${Math.round((k === key ? benchmark : (rates[k] ?? 0)) * 100)}%`).join(" × ")} = ${simulatedSales === null ? "—" : round1(simulatedSales)} ventes simulées`,
    });
  }

  return points.sort((a, b) => (b.monthlyGain ?? 0) - (a.monthlyGain ?? 0));
}

const CRITICAL_SCORE_MAX = 40;
// Exported: this is exactly the score a metric gets at ratio == 1 (current ==
// benchmark) — the "if you just hit the standard" ceiling used by
// lib/diagnostic/scale-score.ts's potentialScore projection.
export const CAUTION_SCORE_MAX = 70;

// Anchored to the metric's already-computed status rather than a raw
// current/benchmark ratio: a raw ratio would put every "caution" metric
// (80-99% of benchmark, see computeMetricStatus's CAUTION_THRESHOLD) at
// score 80-99 — tier vert per lib/diagnostic/health-tier.ts's thresholds —
// mislabeling an under-benchmark metric as "above standard" on a card meant
// to be shared publicly. Segmenting by status guarantees getHealthTier(score)
// always agrees with the real status: critical -> 0-39, caution -> 40-69,
// ok -> 70-100.
function computeHealthScore(current: number, benchmark: number, status: "ok" | "caution" | "critical"): number {
  const ratio = current / benchmark;
  const cautionFloor = 1 - CAUTION_THRESHOLD; // 0.8 — same boundary computeMetricStatus uses

  if (status === "ok") {
    return Math.min(100, Math.round(CAUTION_SCORE_MAX + Math.min(Math.max(ratio - 1, 0), 1) * (100 - CAUTION_SCORE_MAX)));
  }
  if (status === "caution") {
    return Math.round(CRITICAL_SCORE_MAX + ((ratio - cautionFloor) / CAUTION_THRESHOLD) * (CAUTION_SCORE_MAX - CRITICAL_SCORE_MAX));
  }
  return Math.max(0, Math.round((ratio / cautionFloor) * CRITICAL_SCORE_MAX));
}

export type MetricHealthCard = {
  key: MetricKey;
  category: "Setting" | "Closing";
  label: string;
  status: "ok" | "caution" | "critical";
  valuePercent: number;
  benchmarkPercent: number;
  score: number;
  extraClients: number;
  monthlyGain: number | null; // null = no offer price configured (UI falls back to an "extraClients" wording)
};

// Dashboard's shareable health-carousel — every measured metric (unlike
// computeDiagnosticPoints, which keeps only caution/critical), sorted by
// monthlyGain descending so the already-healthy cards (gain 0) end up last.
export function computeMetricHealthCards({
  settingTotals,
  closingTotals,
  benchmarks,
  businessProfile,
  cashContractedTotal,
}: {
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  benchmarks: Record<MetricKey, number>;
  businessProfile: BusinessProfileData;
  cashContractedTotal: number;
}): MetricHealthCard[] {
  const rates = buildRates(settingTotals, closingTotals);
  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);
  const messagesSent = settingTotals.firstMessagesSent;
  const realSales = simulateSales(messagesSent, rates);

  const cards: MetricHealthCard[] = [];

  for (const key of METRIC_KEYS) {
    const current = rates[key];
    const benchmark = benchmarks[key];
    const volume = volumeFor(key, settingTotals, closingTotals);
    const status = computeMetricStatus(current, benchmark, volume);
    if (status === "unmeasured") continue;
    // current is non-null here (status check guarantees it)

    const { extraClients, monthlyGain } =
      status === "ok" ? { extraClients: 0, monthlyGain: 0 } : gainForKey(key, benchmark, rates, messagesSent, realSales, dealPrice);

    cards.push({
      key,
      category: categoryFor(key),
      label: labelFor(key),
      status,
      valuePercent: Math.round((current as number) * 100),
      benchmarkPercent: Math.round(benchmark * 100),
      score: computeHealthScore(current as number, benchmark, status),
      extraClients,
      monthlyGain,
    });
  }

  return cards.sort((a, b) => (b.monthlyGain ?? 0) - (a.monthlyGain ?? 0));
}

export type FullBenchmarkProjection = {
  realSales: number | null;
  simulatedSales: number | null;
  extraClients: number | null;
  monthlyGain: number | null;
};

// Bloc 4 — ALL 5 rates replaced by their benchmark simultaneously. A
// separate, multiplicative projection: never summed with computeDiagnosticPoints'
// per-point gains (those hold every other rate at its real value).
export function computeFullBenchmarkProjection({
  settingTotals,
  closingTotals,
  benchmarks,
  businessProfile,
  cashContractedTotal,
}: {
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  benchmarks: Record<MetricKey, number>;
  businessProfile: BusinessProfileData;
  cashContractedTotal: number;
}): FullBenchmarkProjection {
  const rates = buildRates(settingTotals, closingTotals);
  const messagesSent = settingTotals.firstMessagesSent;
  const realSales = simulateSales(messagesSent, rates);
  const simulatedSales = simulateSales(messagesSent, rates, benchmarks);
  const dealPrice = resolveDealPrice(businessProfile, closingTotals, cashContractedTotal);

  const extraClients = realSales !== null && simulatedSales !== null ? round1(simulatedSales - realSales) : null;
  const monthlyGain = extraClients !== null && dealPrice.price !== null ? Math.round(extraClients * dealPrice.price) : null;

  return { realSales, simulatedSales, extraClients, monthlyGain };
}
