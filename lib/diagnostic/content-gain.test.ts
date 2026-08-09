import { describe, expect, it } from "vitest";

import type { BusinessProfileData } from "@/lib/business/types";
import type { ContentPostRow } from "@/lib/content-posts/types";

import { resolveDealPrice } from "./cascade";
import { computeContentGain } from "./content-gain";
import { aggregateContentTotals, computeContentMetricSummaries, type ContentMetricKey } from "./content-metrics";
import type { MonthWindow } from "./completed-months";
import type { MetricKey } from "./metric-keys";

const round1 = (v: number) => Math.round(v * 10) / 10;

const MONTH: MonthWindow = { year: 2026, month: 5, range: { from: "2026-05-01", to: "2026-05-31" } };

function post(overrides: Partial<ContentPostRow>): ContentPostRow {
  return {
    id: crypto.randomUUID(),
    platform: "youtube",
    title: "Post",
    url: null,
    publishedAt: "2026-05-10",
    views: 1000,
    clicks: null,
    leads: null,
    bookings: null,
    dealsClosed: null,
    ...overrides,
  } as ContentPostRow;
}

const CONTENT_BENCHMARKS: Record<ContentMetricKey, number> = {
  content_click_rate: 0.015,
  content_lead_rate: 0.3,
  content_booking_rate: 0.005,
  content_close_rate: 0.3,
};

const FUNNEL_BENCHMARKS: Record<MetricKey, number> = {
  responseRate: 0.3,
  proposalRate: 0.25,
  bookingRate: 0.6,
  showUpRate: 0.7,
  closingRate: 0.3,
};

const MEASURED_FUNNEL: Record<MetricKey, number | null> = {
  responseRate: 0.5,
  proposalRate: 0.4,
  bookingRate: 0.5,
  showUpRate: 0.8,
  closingRate: 0.2,
};

const PRICE = { price: 2000, isFallback: false, offerName: "Offre", source: "main_offer" as const };

describe("aggregateContentTotals — denominators", () => {
  it("never turns never-filled fields into a measured 0% rate", () => {
    // Every synced row has clicks === null (no organic click API exists).
    const totals = aggregateContentTotals([MONTH], [post({ views: 5000 }), post({ views: 3000 })]);
    expect(totals.samples.content_click_rate.denominator).toBe(0);

    const summaries = computeContentMetricSummaries({ totals, benchmarks: CONTENT_BENCHMARKS });
    const clickRate = summaries.find((s) => s.key === "content_click_rate");
    expect(clickRate?.currentRatePercent).toBeNull();
    expect(clickRate?.status).toBe("unmeasured");
  });

  it("counts only the views of posts that actually carry the figure", () => {
    // 1 annotated post out of 3: the other 39 000 views were never
    // attributed, so they belong to neither side of the ratio.
    const totals = aggregateContentTotals([MONTH], [
      post({ views: 1000, bookings: 10 }),
      post({ views: 20000 }),
      post({ views: 19000 }),
    ]);

    expect(totals.views).toBe(40000); // channel reach is still the full figure
    expect(totals.samples.content_booking_rate).toEqual({ numerator: 10, denominator: 1000, posts: 1 });
  });

  it("keeps a rate unmeasured while its declared sample stays too small", () => {
    const totals = aggregateContentTotals([MONTH], [post({ views: 3, bookings: 2 })]);
    const summary = computeContentMetricSummaries({ totals, benchmarks: CONTENT_BENCHMARKS }).find(
      (s) => s.key === "content_booking_rate"
    );
    // 2 bookings on 3 views is 67%, not a triumph — it's noise.
    expect(summary?.status).toBe("unmeasured");
  });
});

describe("computeContentGain", () => {
  const totals = aggregateContentTotals([MONTH], [
    post({ views: 10000, bookings: 20, dealsClosed: 5 }),
    post({ views: 10000, bookings: 10, dealsClosed: 3 }),
  ]);

  it("values the gap to benchmark with the account's own close rate", () => {
    const gain = computeContentGain({
      metricKey: "content_booking_rate",
      totals,
      contentBenchmarks: CONTENT_BENCHMARKS,
      funnelRates: MEASURED_FUNNEL,
      funnelBenchmarks: FUNNEL_BENCHMARKS,
      dealPrice: PRICE,
    });

    // 30 bookings / 20 000 views = 0,15% vs 0,5% benchmark -> +70 bookings,
    // closed at the account's real 8/30 rate, at 2 000 € each.
    expect(gain.extraUnits).toBe(70);
    expect(gain.extraSales).toBeCloseTo(18.7, 1);
    expect(gain.monthlyGain).toBe(Math.round(70 * (8 / 30) * 2000));
    // Close rate was measured, so nothing was borrowed.
    expect(gain.usesBenchmark).toBe(false);
    expect(gain.chain).toContain("vues (posts renseignés)");
  });

  it("flags the figure when a downstream rate had to be borrowed from the benchmark", () => {
    const noCloseData = aggregateContentTotals([MONTH], [post({ views: 20000, bookings: 30 })]);
    const gain = computeContentGain({
      metricKey: "content_booking_rate",
      totals: noCloseData,
      contentBenchmarks: CONTENT_BENCHMARKS,
      funnelRates: MEASURED_FUNNEL,
      funnelBenchmarks: FUNNEL_BENCHMARKS,
      dealPrice: PRICE,
    });

    expect(gain.usesBenchmark).toBe(true);
    expect(gain.chain).toContain("benchmark");
    expect(gain.extraSales).toBeCloseTo(70 * 0.3, 1);
  });

  it("claims no gain from a metric already above its benchmark", () => {
    const strong = aggregateContentTotals([MONTH], [post({ views: 10000, bookings: 200, dealsClosed: 60 })]);
    const gain = computeContentGain({
      metricKey: "content_booking_rate",
      totals: strong,
      contentBenchmarks: CONTENT_BENCHMARKS,
      funnelRates: MEASURED_FUNNEL,
      funnelBenchmarks: FUNNEL_BENCHMARKS,
      dealPrice: PRICE,
    });

    expect(gain.extraUnits).toBe(0);
    expect(gain.monthlyGain).toBe(0);
  });

  it("bridges clicks to a sale through the funnel the account really measures", () => {
    const withClicks = aggregateContentTotals([MONTH], [post({ views: 10000, clicks: 50, leads: 20 })]);
    const gain = computeContentGain({
      metricKey: "content_click_rate",
      totals: withClicks,
      contentBenchmarks: CONTENT_BENCHMARKS,
      funnelRates: MEASURED_FUNNEL,
      funnelBenchmarks: FUNNEL_BENCHMARKS,
      dealPrice: PRICE,
    });

    // 0,5% -> 1,5% = +100 clicks, 40% of which become leads (measured),
    // then the account's own proposal/booking/show-up/closing rates. The
    // response rate is deliberately absent: a content lead already replied.
    const leadToSale = 0.4 * 0.5 * 0.8 * 0.2;
    expect(gain.extraUnits).toBe(100);
    expect(gain.extraSales).toBe(round1(100 * 0.4 * leadToSale));
    expect(gain.chain).not.toContain("de réponses");
  });

  it("reports no € rather than a fabricated one when no price is resolvable", () => {
    const gain = computeContentGain({
      metricKey: "content_booking_rate",
      totals,
      contentBenchmarks: CONTENT_BENCHMARKS,
      funnelRates: MEASURED_FUNNEL,
      funnelBenchmarks: FUNNEL_BENCHMARKS,
      dealPrice: { price: null, isFallback: false, offerName: null, source: "none" },
    });

    expect(gain.monthlyGain).toBeNull();
    expect(gain.extraSales).toBeGreaterThan(0);
  });
});

describe("resolveDealPrice — last-rung fallback", () => {
  function profileWith(offers: { price: number | null; isMain: boolean }[]): BusinessProfileData {
    return {
      sales: { offers: offers.map((o, i) => ({ id: `${i}`, name: `Offre ${i}`, ...o })) },
    } as unknown as BusinessProfileData;
  }

  it("prefers the main offer, then the real average basket", () => {
    expect(resolveDealPrice(profileWith([{ price: 3000, isMain: true }]), { callsAttended: 10, salesClosed: 5 }, 10000).price).toBe(3000);
    expect(
      resolveDealPrice(profileWith([{ price: 3000, isMain: false }]), { callsAttended: 10, salesClosed: 5 }, 10000).source
    ).toBe("average_basket");
  });

  it("averages the priced offers rather than leaving every gain unquantified", () => {
    // No main offer, nothing closed yet — previously price === null, which
    // silently removed every point from "Points à améliorer".
    const price = resolveDealPrice(profileWith([{ price: 1000, isMain: false }, { price: 3000, isMain: false }]), { callsAttended: 0, salesClosed: 0 }, 0);
    expect(price.price).toBe(2000);
    expect(price.source).toBe("offer_average");
    expect(price.isFallback).toBe(true);
  });

  it("still reports no price when the account has entered none", () => {
    expect(resolveDealPrice(profileWith([{ price: null, isMain: false }]), { callsAttended: 0, salesClosed: 0 }, 0).price).toBeNull();
  });
});
