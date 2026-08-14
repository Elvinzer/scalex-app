import { describe, expect, it } from "vitest";

import {
  DEFAULT_BOOKING_PAGE_SETTINGS,
  getAccentContrast,
  getSafeBookingEmbedUrl,
  normalizeBookingPageSettings,
} from "./config";

describe("booking page appearance", () => {
  it("keeps a complete dark default", () => {
    expect(normalizeBookingPageSettings({})).toEqual(DEFAULT_BOOKING_PAGE_SETTINGS);
  });

  it("warns when an accent cannot reach AA contrast on its button text", () => {
    const result = getAccentContrast("#777777", "dark");
    expect(result.warning).toBe(true);
    expect(result.suggestedAccent).not.toBe("#777777");
  });

  it("only accepts YouTube and Vimeo embeds", () => {
    expect(getSafeBookingEmbedUrl("https://www.youtube.com/watch?v=abc123")).toContain("youtube-nocookie.com/embed/abc123");
    expect(getSafeBookingEmbedUrl("https://example.com/video.mp4")).toBeNull();
  });
});

