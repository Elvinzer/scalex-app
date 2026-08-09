import { formatEur } from "@/lib/currency";

import type { DealPrice } from "./cascade";
import type { ContentMetricKey, ContentMetricSample, ContentTotals } from "./content-metrics";
import type { MetricKey } from "./metric-keys";

// € value of closing the gap on a content metric.
//
// The historical position (see content-metrics.ts's header) was that no
// €/client figure could be attached to content, "since there's no cascade
// linking a view to a final sale yet". That's no longer true: content_posts
// now carries bookings/dealsClosed, so views -> RDV -> vente is a measured
// chain, and views -> clics -> leads reaches a sale through the funnel rates
// the account already measures. A content point with no number was still
// shown in "Points à améliorer" with a dash, which is the worst of both
// worlds — ranked as a problem, impossible to arbitrate against the ones
// carrying €.
//
// Two rules make this an estimate rather than an invention:
//   1. Every rate is the account's OWN measured rate when it exists. The
//      niche benchmark is only ever a stand-in for a rate that isn't
//      measurable, and each substitution is named in `chain` so the tooltip
//      shows exactly what the figure rests on.
//   2. Nothing is aggregated by the LLM (CLAUDE.md) and nothing is stored —
//      the whole chain is recomputed on read, like every other rate here.
//
// Deliberately NOT summed with anything: the clics chain and the RDV chain
// both start from the same views, so adding them would count the same
// audience twice. Each figure answers "what would THIS metric be worth at
// benchmark", one card at a time — the same convention as the cascade
// points, which each hold the other four rates at their real value.

export type ContentGain = {
  // Extra units of the metric's own numerator (clics, leads, RDV, ventes).
  extraUnits: number;
  extraSales: number;
  monthlyGain: number | null;
  // Human-readable multiplication actually performed, benchmark
  // substitutions included — rendered in the card's CalcPopover.
  chain: string;
  // true when at least one downstream rate had to be borrowed from the
  // niche benchmark, so the UI can say "estimation" rather than a figure
  // that reads as measured.
  usesBenchmark: boolean;
};

// fr-FR throughout: the chain is shown to the user in a tooltip, so "0,5%"
// and not JS's default "0.5%".
// Two decimals for the same reason as content-metrics.ts: the benchmark
// itself is 0,15%, and one decimal would print it as "0,2%".
const PERCENT_FORMAT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const PERCENT = (value: number) => `${PERCENT_FORMAT.format(Math.round(value * 10000) / 100)}%`;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// A rate is taken from the account when it's measurable, from the niche
// benchmark otherwise — never assumed to be 0 (which would silently zero
// out the whole chain) nor 100% (which would inflate it).
function resolveRate(
  real: number | null,
  benchmark: number,
  label: string
): { value: number; isReal: boolean; describe: string } {
  const isReal = real !== null;
  const value = isReal ? real : benchmark;
  return {
    value,
    isReal,
    describe: `${PERCENT(value)} ${label}${isReal ? "" : " (benchmark)"}`,
  };
}

export function computeContentGain({
  metricKey,
  totals,
  contentBenchmarks,
  funnelRates,
  funnelBenchmarks,
  dealPrice,
}: {
  metricKey: ContentMetricKey;
  totals: ContentTotals;
  contentBenchmarks: Record<ContentMetricKey, number>;
  funnelRates: Record<MetricKey, number | null>;
  funnelBenchmarks: Record<MetricKey, number>;
  dealPrice: DealPrice;
}): ContentGain {
  // What a single lead is worth once it enters the pipeline. Starts at
  // proposalRate, not responseRate: a content lead has already raised their
  // hand, so the "did they reply to my DM" stage doesn't apply to them.
  const leadStages: MetricKey[] = ["proposalRate", "bookingRate", "showUpRate", "closingRate"];
  const leadStageRates = leadStages.map((key) =>
    resolveRate(funnelRates[key], funnelBenchmarks[key], LEAD_STAGE_LABELS[key])
  );
  const leadToSale = leadStageRates.reduce((product, stage) => product * stage.value, 1);

  const clickToLead = resolveRate(
    sampleRate(totals.samples.content_lead_rate),
    contentBenchmarks.content_lead_rate,
    "de clics qui deviennent des leads"
  );
  const bookingToSale = resolveRate(
    sampleRate(totals.samples.content_close_rate),
    contentBenchmarks.content_close_rate,
    "de RDV closés"
  );

  const sample = totals.samples[metricKey];
  const base = sample.denominator;
  const baseLabel = BASE_LABELS[metricKey];
  const current = sampleRate(sample);
  const benchmark = contentBenchmarks[metricKey];
  // Only the gap counts. A metric already at or above benchmark has no gain
  // to claim — max(0) rather than a negative "gain".
  const extraUnits = Math.max(0, (benchmark - (current ?? 0)) * base);

  const downstream: { value: number; isReal: boolean; describe: string }[] =
    metricKey === "content_click_rate"
      ? [clickToLead, ...leadStageRates]
      : metricKey === "content_lead_rate"
        ? leadStageRates
        : metricKey === "content_booking_rate"
          ? [bookingToSale]
          : [];

  const extraSales =
    metricKey === "content_click_rate"
      ? extraUnits * clickToLead.value * leadToSale
      : metricKey === "content_lead_rate"
        ? extraUnits * leadToSale
        : metricKey === "content_booking_rate"
          ? extraUnits * bookingToSale.value
          : extraUnits;

  const monthlyGain = dealPrice.price === null ? null : Math.round(extraSales * dealPrice.price);

  const chain = [
    `${NUMBER.format(Math.round(base))} ${baseLabel} × ${PERCENT(benchmark)} (benchmark) = +${DECIMAL.format(round1(extraUnits))}`,
    downstream.length > 0 ? `× ${downstream.map((stage) => stage.describe).join(" × ")}` : null,
    `= ${DECIMAL.format(round1(extraSales))} vente${extraSales >= 2 ? "s" : ""} en plus`,
    dealPrice.price === null ? null : `× ${formatEur(Math.round(dealPrice.price))} = ${formatEur(monthlyGain as number)}`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    extraUnits: round1(extraUnits),
    extraSales: round1(extraSales),
    monthlyGain,
    chain,
    usesBenchmark: downstream.some((stage) => !stage.isReal),
  };
}

const NUMBER = new Intl.NumberFormat("fr-FR");
const DECIMAL = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

const LEAD_STAGE_LABELS: Record<MetricKey, string> = {
  responseRate: "de réponses",
  proposalRate: "de propositions d'appel",
  bookingRate: "d'appels réservés",
  showUpRate: "de présence en appel",
  closingRate: "de closing",
};

// What the restricted denominator counts, for the tooltip's first term.
const BASE_LABELS: Record<ContentMetricKey, string> = {
  content_click_rate: "vues (posts renseignés)",
  content_lead_rate: "clics (posts renseignés)",
  content_booking_rate: "vues (posts renseignés)",
  content_close_rate: "RDV bookés (posts renseignés)",
};

// null on an empty denominator — no post carries the figure, so there is no
// rate, as opposed to a rate of zero.
function sampleRate(sample: ContentMetricSample): number | null {
  return sample.denominator > 0 ? sample.numerator / sample.denominator : null;
}
