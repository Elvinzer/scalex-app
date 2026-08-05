import { describe, expect, it } from "vitest";

import { computePostRates } from "./rates";
import type { ContentPostRow } from "./types";

function makePost(overrides: Partial<ContentPostRow>): ContentPostRow {
  return {
    id: "post-1",
    platform: "Instagram",
    type: "post",
    title: "Test",
    publishedAt: "2026-01-01",
    url: null,
    views: 1000,
    likes: null,
    comments: null,
    shares: null,
    clicks: null,
    leads: null,
    bookings: null,
    dealsClosed: null,
    source: "instagram",
    externalId: "media-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("computePostRates", () => {
  it("never coerces null clicks into a measured 0% click rate", () => {
    expect(computePostRates(makePost({ clicks: null })).clickRate).toBeNull();
  });

  it("never coerces null leads into a measured 0% lead rate (the reported bug)", () => {
    expect(computePostRates(makePost({ leads: null })).viewToLeadRate).toBeNull();
  });

  it("still computes a real rate once clicks/leads are actually measured", () => {
    const rates = computePostRates(makePost({ clicks: 10, leads: 2, views: 1000 }));
    expect(rates.clickRate).toBeCloseTo(0.01);
    expect(rates.viewToLeadRate).toBeCloseTo(0.002);
  });
});
