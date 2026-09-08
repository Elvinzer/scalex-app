import { describe, expect, it } from "vitest";
import { aggregateAcquisitionSources, type MetaMetricRow } from "./acquisition-sources";

describe("aggregateAcquisitionSources", () => {
  it("aggregates the compact projection without counting ads twice or including another month", () => {
    const row: MetaMetricRow = { level: "campaign", date: "2026-08-05", spendCents: 100, impressions: 30, linkClicks: 7, leads: 2, registrations: 1, purchases: 1, purchaseValueCents: 500 };
    const totals = aggregateAcquisitionSources({
      range: { from: "2026-08-01", to: "2026-08-31" },
      emailCampaigns: [],
      metaMetrics: [row, { ...row, level: "adset" }, { ...row, level: "ad" }, { ...row, date: "2026-07-31" }],
      nativeBookingLeads: [
        { status: "converted", createdAt: new Date("2026-08-31T23:59:59Z") },
        { status: "open", createdAt: new Date("2026-08-01T00:00:00Z") },
        { status: "converted", createdAt: new Date("2026-09-01T00:00:00Z") },
      ],
    });
    expect(totals.meta).toEqual({ spendCents: 100, impressions: 30, linkClicks: 7, leads: 2, registrations: 1, purchases: 1, purchaseValueCents: 500 });
    expect(totals.native).toEqual({ leads: 2, convertedLeads: 1 });
  });
});
