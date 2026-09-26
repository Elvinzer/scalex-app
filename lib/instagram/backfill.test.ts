import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  listMedia: vi.fn(),
  listStories: vi.fn(),
  fetchMediaInsights: vi.fn(),
  fetchCarouselChildren: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    update: mocks.update,
    insert: mocks.insert,
  },
}));

vi.mock("./client", () => ({
  fetchCarouselChildren: mocks.fetchCarouselChildren,
  fetchMediaInsights: mocks.fetchMediaInsights,
  listMedia: mocks.listMedia,
  listStories: mocks.listStories,
}));

import type { RawInstagramMedia } from "./client";
import { backfillInstagramPosts } from "./backfill";

const existingMedia = {
  id: "media-1",
  mediaType: "VIDEO",
  timestamp: "2024-03-04T08:00:00.000Z",
  caption: "Titre actuel",
  captionFetched: true,
  permalink: "https://www.instagram.com/reel/current-slug/",
  likeCount: 10,
  commentsCount: 2,
  mediaUrl: null,
  thumbnailUrl: null,
} satisfies RawInstagramMedia;

function setupKnownMedia(media: RawInstagramMedia, storedPermalink = "https://www.instagram.com/reel/stored-slug/"): void {
  mocks.select.mockReturnValue({
    from: () => ({
      where: vi.fn().mockResolvedValue([{ mediaId: media.id, caption: "Titre actuel", permalink: storedPermalink }]),
    }),
  });
  mocks.listMedia.mockResolvedValue([media]);
  mocks.listStories.mockResolvedValue([]);
  mocks.update.mockImplementation(() => ({
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  }));
}

describe("Instagram historical metadata refresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refreshes the permalink projection for old posts used by the Top 3 panel", async () => {
    setupKnownMedia(existingMedia);

    const result = await backfillInstagramPosts("user-1", "token", new Date("2026-09-01T00:00:00.000Z"));

    expect(result).toEqual({ processed: 0, skipped: 0, completed: true });
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update.mock.results[0]?.value.set).toHaveBeenCalledWith({
      caption: "Titre actuel",
      permalink: "https://www.instagram.com/reel/current-slug/",
    });
    expect(mocks.update.mock.results[1]?.value.set).toHaveBeenCalledWith({
      title: "Titre actuel",
      url: "https://www.instagram.com/reel/current-slug/",
    });
    expect(mocks.fetchMediaInsights).not.toHaveBeenCalled();
  });

  it("does not erase an existing caption when Meta omits the caption field", async () => {
    setupKnownMedia({ ...existingMedia, caption: null, captionFetched: false, permalink: "https://www.instagram.com/p/refreshed-slug" });

    await backfillInstagramPosts("user-1", "token", new Date("2026-09-01T00:00:00.000Z"));

    expect(mocks.update.mock.results[0]?.value.set).toHaveBeenCalledWith({
      permalink: "https://www.instagram.com/p/refreshed-slug/",
    });
    expect(mocks.update.mock.results[1]?.value.set).toHaveBeenCalledWith({
      url: "https://www.instagram.com/p/refreshed-slug/",
    });
  });

  it("skips historical writes when the stored permalink is already current", async () => {
    setupKnownMedia(existingMedia, existingMedia.permalink);

    await backfillInstagramPosts("user-1", "token", new Date("2026-09-01T00:00:00.000Z"));

    expect(mocks.update).not.toHaveBeenCalled();
  });
});
