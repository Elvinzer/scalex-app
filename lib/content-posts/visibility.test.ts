import { describe, expect, it } from "vitest";

import type { ContentPostRow } from "./types";
import { filterVisibleContentPosts } from "./visibility";

function post(source: string, externalId: string | null): ContentPostRow {
  return {
    id: `${source}-${externalId ?? "manual"}`,
    platform: source,
    type: source === "youtube" ? "video" : "post",
    title: "Post",
    publishedAt: "2026-08-10",
    url: null,
    views: 100,
    likes: null,
    comments: null,
    shares: null,
    clicks: null,
    leads: null,
    bookings: null,
    dealsClosed: null,
    source,
    externalId,
    createdAt: "2026-08-10T00:00:00.000Z",
  };
}

describe("filterVisibleContentPosts", () => {
  it("uses the same public-video rule as the content page", () => {
    const visible = filterVisibleContentPosts(
      [post("youtube", "public"), post("youtube", "private"), post("instagram", "ig-1"), post("manual", null)],
      [
        { videoId: "public", privacyStatus: "public" },
        { videoId: "private", privacyStatus: "private" },
      ]
    );

    expect(visible.map((row) => row.externalId)).toEqual(["public", "ig-1", null]);
  });

  it("keeps legacy YouTube rows whose privacy status is not known yet", () => {
    expect(
      filterVisibleContentPosts([post("youtube", "legacy")], [{ videoId: "legacy", privacyStatus: null }])
    ).toHaveLength(1);
  });
});
