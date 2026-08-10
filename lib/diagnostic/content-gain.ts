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

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

// A rate is taken from the account when it's measurable, from the niche
// benchmark otherwise — never assumed to be 0 (which would silently zero
// out the whole chain) nor 100% (which would inflate it).
function resolveRate(
  real: number | null,
  benchmark: number,
  label: string,
  locale: "fr" | "en"
): { value: number; isReal: boolean; describe: string } {
  const isReal = real !== null;
  const value = isReal ? real : benchmark;
  return {
    value,
    isReal,
    describe: `${formatPercent(value, locale)} ${label}${isReal ? "" : " (benchmark)"}`,
  };
}

export function computeContentGain({
  metricKey,
  totals,
  contentBenchmarks,
  funnelRates,
  funnelBenchmarks,
  dealPrice,
  locale = "fr",
}: {
  metricKey: ContentMetricKey;
  totals: ContentTotals;
  contentBenchmarks: Record<ContentMetricKey, number>;
  funnelRates: Record<MetricKey, number | null>;
  funnelBenchmarks: Record<MetricKey, number>;
  dealPrice: DealPrice;
  locale?: string;
}): ContentGain {
  const uiLocale: "fr" | "en" = locale === "en" ? "en" : "fr";
  const formatLocale = uiLocale === "en" ? "en-GB" : "fr-FR";
  const numberFormat = new Intl.NumberFormat(formatLocale);
  const decimalFormat = new Intl.NumberFormat(formatLocale, { maximumFractionDigits: 1 });

  // What a single lead is worth once it enters the pipeline. Starts at
  // proposalRate, not responseRate: a content lead has already raised their
  // hand, so the "did they reply to my DM" stage doesn't apply to them.
  const leadStages: MetricKey[] = ["proposalRate", "bookingRate", "showUpRate", "closingRate"];
  const leadStageRates = leadStages.map((key) =>
    resolveRate(funnelRates[key], funnelBenchmarks[key], stageLabel(key, uiLocale), uiLocale)
  );
  const leadToSale = leadStageRates.reduce((product, stage) => product * stage.value, 1);

  const clickToLead = resolveRate(
    sampleRate(totals.samples.content_lead_rate),
    contentBenchmarks.content_lead_rate,
    uiLocale === "en" ? "of clicks becoming leads" : "de clics qui deviennent des leads",
    uiLocale
  );
  const bookingToSale = resolveRate(
    sampleRate(totals.samples.content_close_rate),
    contentBenchmarks.content_close_rate,
    uiLocale === "en" ? "of booked calls closing" : "de RDV closés",
    uiLocale
  );

  const sample = totals.samples[metricKey];
  const base = sample.denominator;
  const baseLabel = baseLabelFor(metricKey, uiLocale);
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

  const salesLabel =
    uiLocale === "en"
      ? `${decimalFormat.format(round1(extraSales))} ${extraSales === 1 ? "extra sale" : "extra sales"}`
      : `${decimalFormat.format(round1(extraSales))} vente${extraSales >= 2 ? "s" : ""} en plus`;
  const priceChain =
    dealPrice.price === null
      ? null
      : `× ${formatEur(Math.round(dealPrice.price), formatLocale)} = ${formatEur(monthlyGain as number, formatLocale)}`;

  const chain = [
    `${numberFormat.format(Math.round(base))} ${baseLabel} × ${formatPercent(benchmark, uiLocale)} (benchmark) = +${decimalFormat.format(round1(extraUnits))}`,
    downstream.length > 0 ? `× ${downstream.map((stage) => stage.describe).join(" × ")}` : null,
    `= ${salesLabel}`,
    priceChain,
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

function formatPercent(value: number, locale: "fr" | "en"): string {
  const formatLocale = locale === "en" ? "en-GB" : "fr-FR";
  return `${new Intl.NumberFormat(formatLocale, { maximumFractionDigits: 2 }).format(Math.round(value * 10000) / 100)}%`;
}

const LEAD_STAGE_LABELS: Record<MetricKey, { fr: string; en: string }> = {
  responseRate: { fr: "de réponses", en: "of replies" },
  proposalRate: { fr: "de propositions d'appel", en: "of call proposals" },
  bookingRate: { fr: "d'appels réservés", en: "of booked calls" },
  showUpRate: { fr: "de présence en appel", en: "of calls attended" },
  closingRate: { fr: "de closing", en: "of closing" },
};

// What the restricted denominator counts, for the tooltip's first term.
const BASE_LABELS: Record<ContentMetricKey, { fr: string; en: string }> = {
  content_click_rate: { fr: "vues (posts renseignés)", en: "views (annotated posts)" },
  content_lead_rate: { fr: "clics (posts renseignés)", en: "clicks (annotated posts)" },
  content_booking_rate: { fr: "vues (posts renseignés)", en: "views (annotated posts)" },
  content_close_rate: { fr: "RDV bookés (posts renseignés)", en: "booked calls (annotated posts)" },
};

function stageLabel(key: MetricKey, locale: "fr" | "en"): string {
  return LEAD_STAGE_LABELS[key][locale];
}

function baseLabelFor(key: ContentMetricKey, locale: "fr" | "en"): string {
  return BASE_LABELS[key][locale];
}

// null on an empty denominator — no post carries the figure, so there is no
// rate, as opposed to a rate of zero.
function sampleRate(sample: ContentMetricSample): number | null {
  return sample.denominator > 0 ? sample.numerator / sample.denominator : null;
}
