import { inRange } from "@/lib/dashboard/metrics";
import type { ContentPostRow } from "@/lib/content-posts/types";
import { rate } from "@/lib/setting/funnel";
import type { VideoAttributionTotals } from "@/lib/youtube/attribution-rules";

import { computeMetricStatus, type MetricStatus } from "./cascade";
import type { MonthWindow } from "./completed-months";

// The content mini-funnel (views -> clicks -> leads, views -> RDV -> vente)
// — deliberately separate from lib/diagnostic/cascade.ts's 5-stage
// messages->sales cascade (see db/schema.ts's diagnosticMetricEnum comment).
// It used to carry no €/client simulation at all, "since there's no cascade
// linking a view to a final sale yet"; bookings/dealsClosed closed that gap,
// and the valuation now lives in ./content-gain.ts. This file stays limited
// to rates and status.
//
// content_booking_rate/content_close_rate are a second, views-denominated
// mini-funnel bolted onto the same family: views -> RDV bookés -> RDV
// closés, from content_posts.bookings/dealsClosed (manual entry, see
// db/schema.ts's contentPosts comment) — deliberately NOT denominated by
// clicks like content_lead_rate above, since clicks is always null/0 for
// every synced (Instagram/YouTube) row (no organic click API exists), which
// would make content_lead_rate's own pattern permanently "unmeasured" here.
// Works across BOTH platforms uniformly (content_posts is platform-shared)
// even though only YouTube has a manual-entry UI today (see
// app/(app)/acquisition/contenu/actions.ts) — an Instagram row's
// bookings/dealsClosed simply stay null until it gets one too.
export type ContentMetricKey = "content_click_rate" | "content_lead_rate" | "content_booking_rate" | "content_close_rate";

export const CONTENT_METRIC_KEYS: ContentMetricKey[] = [
  "content_click_rate",
  "content_lead_rate",
  "content_booking_rate",
  "content_close_rate",
];

const CONTENT_METRIC_LABELS: Record<ContentMetricKey, string> = {
  content_click_rate: "Taux de clic sur le contenu",
  content_lead_rate: "Taux de conversion clic → lead",
  content_booking_rate: "Taux de RDV bookés depuis le contenu",
  content_close_rate: "Taux de closing des RDV issus du contenu",
};

// One content rate, with the denominator restricted to the posts that
// actually carry the numerator.
//
// This restriction is the whole point. bookings/dealsClosed are entered by
// hand, post by post; clicks/leads are null on every synced row (no organic
// click API). Summing the numerator with `?? 0` over ALL posts while keeping
// every post's views in the denominator doesn't measure performance, it
// measures how much of the back-office got filled in — one declared post out
// of 46 reads as "0,008% of your views book a call", i.e. a catastrophic
// rate, and the € gap against a 0,5% benchmark then reaches six figures on a
// channel nobody has finished annotating. Counting only the posts where the
// figure was declared answers the real question: on the content you DID
// annotate, how does it convert?
export type ContentMetricSample = {
  numerator: number;
  denominator: number;
  // Posts contributing to this sample — surfaced so callers can say "sur 3
  // posts renseignés" instead of implying the whole channel was measured.
  posts: number;
};

export type ContentTotals = {
  // Channel-wide reach, every post in the window. Kept separate from the
  // per-metric denominators below: this one is real for every post (views
  // always sync), the others are only as complete as the manual entry.
  views: number;
  clicks: number;
  leads: number;
  bookings: number;
  dealsClosed: number;
  samples: Record<ContentMetricKey, ContentMetricSample>;
};

const EMPTY_SAMPLE = (): ContentMetricSample => ({ numerator: 0, denominator: 0, posts: 0 });

export function aggregateContentTotals(
  months: MonthWindow[],
  allPosts: ContentPostRow[],
  attributions: ReadonlyMap<string, VideoAttributionTotals> = new Map()
): ContentTotals {
  const inWindow = allPosts.filter((post) => months.some(({ range }) => inRange(post.publishedAt, range)));

  const samples: Record<ContentMetricKey, ContentMetricSample> = {
    content_click_rate: EMPTY_SAMPLE(),
    content_lead_rate: EMPTY_SAMPLE(),
    content_booking_rate: EMPTY_SAMPLE(),
    content_close_rate: EMPTY_SAMPLE(),
  };

  const accumulate = (key: ContentMetricKey, numerator: number | null, denominator: number) => {
    if (numerator === null) return;
    samples[key].numerator += numerator;
    samples[key].denominator += denominator;
    samples[key].posts += 1;
  };

  const totals = { views: 0, clicks: 0, leads: 0, bookings: 0, dealsClosed: 0 };

  for (const post of inWindow) {
    const attribution = post.externalId ? attributions.get(post.externalId) : undefined;
    const attributedDeals = attribution ? attribution.declaredSales + attribution.estimatedSales : 0;
    // A directly linked sale is the stronger commercial fact. Manual
    // post-level annotations remain the fallback for content that predates
    // the attribution table; the two are never added together.
    const dealsClosed = attributedDeals > 0 ? attributedDeals : post.dealsClosed;
    totals.views += post.views;
    totals.clicks += post.clicks ?? 0;
    totals.leads += post.leads ?? 0;
    totals.bookings += post.bookings ?? 0;
    totals.dealsClosed += dealsClosed ?? 0;

    accumulate("content_click_rate", post.clicks, post.views);
    // leads are denominated by that same post's clicks — a post with leads
    // but no click count can't contribute a rate to either side.
    accumulate("content_lead_rate", post.clicks === null ? null : post.leads, post.clicks ?? 0);
    accumulate("content_booking_rate", post.bookings, post.views);
    accumulate("content_close_rate", post.bookings === null ? null : dealsClosed, post.bookings ?? 0);
  }

  return { ...totals, samples };
}

export type ContentMetricSummary = {
  key: ContentMetricKey;
  category: "Contenu";
  label: string;
  status: MetricStatus;
  currentRatePercent: number | null;
  benchmarkRatePercent: number;
  // How much content the rate was actually read from — lets the UI qualify
  // a figure built on a handful of annotated posts.
  sample: ContentMetricSample;
};

export function computeContentMetricSummaries({
  totals,
  benchmarks: contentBenchmarks,
  activeMetricKeys = CONTENT_METRIC_KEYS,
}: {
  totals: ContentTotals;
  benchmarks: Record<ContentMetricKey, number>;
  activeMetricKeys?: ContentMetricKey[];
}): ContentMetricSummary[] {
  return activeMetricKeys.map((key) => {
    const sample = totals.samples[key];
    // rate() already returns null on a zero denominator, which is exactly
    // "no post carries this figure" — never a measured 0%.
    const current = rate(sample.numerator, sample.denominator);
    const benchmark = contentBenchmarks[key];
    // Volume is the restricted denominator, so MIN_VOLUME now guards the
    // right thing: a rate read off two annotated posts stays "unmeasured"
    // instead of being ranked against the whole funnel.
    const status = computeMetricStatus(current, benchmark, sample.denominator);

    return {
      key,
      category: "Contenu" as const,
      label: CONTENT_METRIC_LABELS[key],
      status,
      // Two decimals, unlike the funnel metrics' integer percents: a
      // views-denominated rate lives below 1% by nature, and rounding
      // 0,09% and 0,15% both to "0%" renders a card reading "0% vs 0%,
      // critique".
      currentRatePercent: current === null ? null : Math.round(current * 10000) / 100,
      benchmarkRatePercent: Math.round(benchmark * 10000) / 100,
      sample,
    };
  });
}
