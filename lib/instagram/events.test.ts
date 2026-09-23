import { describe, expect, it } from "vitest";

import { normalizeMedia } from "./events";
import type { RawInstagramMedia } from "./client";

const media: RawInstagramMedia = {
  id: "media-1",
  caption: "Un titre utile\nLe reste de la légende",
  captionFetched: true,
  mediaType: "VIDEO",
  permalink: "https://www.instagram.com/reel/example",
  timestamp: "2026-09-18T16:30:07.000Z",
  likeCount: 6,
  commentsCount: 0,
  mediaUrl: null,
  thumbnailUrl: null,
};

describe("normalizeMedia", () => {
  it("uses the first caption line as the content title", () => {
    expect(normalizeMedia(media, { reach: 375 }).title).toBe("Un titre utile");
  });

  it("keeps a dated fallback when Instagram has no caption", () => {
    expect(normalizeMedia({ ...media, caption: null }, { reach: 375 }).title).toBe("Post Instagram du 2026-09-18");
  });
});
