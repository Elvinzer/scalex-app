import { describe, expect, it } from "vitest";

import { aggregateYoutubeReach, classifyYoutubeReach, normalizeClickRate } from "./reach";

const jobCreatedAt = new Date("2026-09-01T00:00:00Z");
const latestReportEndAt = new Date("2026-09-20T00:00:00Z");

describe("YouTube Reporting reach states", () => {
  it("keeps a video pending until a generated report covers its publication date", () => {
    expect(classifyYoutubeReach({
      publishedAt: new Date("2026-09-19T12:00:00Z"),
      impressions: null,
      impressionsClickThroughRate: null,
      jobCreatedAt,
      latestReportEndAt: null,
      reportsAvailable: false,
    })).toEqual({ status: "pending", needsInvestigation: false });
  });

  it("marks videos before the initial history window as historically unavailable", () => {
    expect(classifyYoutubeReach({
      publishedAt: new Date("2026-07-01T12:00:00Z"),
      impressions: null,
      impressionsClickThroughRate: null,
      jobCreatedAt,
      latestReportEndAt,
      reportsAvailable: true,
    })).toEqual({ status: "historically_unavailable", needsInvestigation: false });
  });

  it("flags a recent missing row after report coverage as a pipeline issue", () => {
    expect(classifyYoutubeReach({
      publishedAt: new Date("2026-09-19T12:00:00Z"),
      impressions: null,
      impressionsClickThroughRate: null,
      jobCreatedAt,
      latestReportEndAt,
      reportsAvailable: true,
    })).toEqual({ status: "pending", needsInvestigation: true });
  });

  it("keeps a real zero available instead of treating it as missing", () => {
    expect(classifyYoutubeReach({
      publishedAt: new Date("2026-09-19T12:00:00Z"),
      impressions: 0,
      impressionsClickThroughRate: 0,
      jobCreatedAt,
      latestReportEndAt,
      reportsAvailable: true,
    })).toEqual({ status: "available", needsInvestigation: false });
  });

  it("normalizes percentage and fractional CTR values without turning blanks into zero", () => {
    expect(normalizeClickRate("7.2")).toBe(7.2);
    expect(normalizeClickRate("0.072")).toBeCloseTo(7.2);
    expect(normalizeClickRate(" ")).toBeNull();
  });

  it("aggregates daily impressions and weights CTR by impressions", () => {
    expect(aggregateYoutubeReach([
      { impressions: 1_200, impressionsClickThroughRate: 6.5 },
      { impressions: 1_300, impressionsClickThroughRate: 7.5 },
    ])).toEqual({
      impressions: 2_500,
      impressionsClickThroughRate: 7.02,
    });
  });

  it("keeps a zero daily reach value as available data", () => {
    expect(aggregateYoutubeReach([{ impressions: 0, impressionsClickThroughRate: 0 }])).toEqual({
      impressions: 0,
      impressionsClickThroughRate: 0,
    });
  });
});
