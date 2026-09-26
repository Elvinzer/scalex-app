import { describe, expect, it } from "vitest";

import { isInstagramPermalink, normalizeInstagramPermalink } from "./urls";

describe("Instagram permalinks", () => {
  it("normalizes API URLs to a stable canonical host and path", () => {
    expect(normalizeInstagramPermalink("https://instagram.com/clubvipfinance/reel/DdmMimbgXFX/?utm_source=minaly")).toBe(
      "https://www.instagram.com/clubvipfinance/reel/DdmMimbgXFX/"
    );
    expect(normalizeInstagramPermalink("https://www.instagram.com/reel/DdmMimbgXFX")).toBe(
      "https://www.instagram.com/reel/DdmMimbgXFX/"
    );
    expect(normalizeInstagramPermalink("https://www.instagram.com/stories/clubvipfinance/3991973019655918351")).toBe(
      "https://www.instagram.com/stories/clubvipfinance/3991973019655918351/"
    );
  });

  it("rejects non-Instagram or non-media URLs", () => {
    expect(isInstagramPermalink("https://example.com/reel/DdmMimbgXFX/")).toBe(false);
    expect(isInstagramPermalink("https://www.instagram.com/accounts/login/")).toBe(false);
    expect(isInstagramPermalink(null)).toBe(false);
  });
});
