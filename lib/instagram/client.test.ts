import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchMediaInsights, listMedia } from "./client";

describe("Instagram API client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("requests media fields supported by Instagram Login", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "media-1",
              caption: "Un vrai titre de Reel",
              media_type: "VIDEO",
              permalink: "https://www.instagram.com/reel/example",
              timestamp: "2026-08-01T08:00:00.000Z",
              like_count: 12,
              comments_count: 3,
              media_url: "https://cdn.example.com/video.mp4",
              thumbnail_url: "https://cdn.example.com/video.jpg",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const media = await listMedia("instagram-test-token");
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const fields = requestUrl.searchParams.get("fields") ?? "";

    expect(media).toHaveLength(1);
    expect(media[0]?.mediaType).toBe("VIDEO");
    expect(media[0]?.caption).toBe("Un vrai titre de Reel");
    expect(media[0]?.captionFetched).toBe(true);
    expect(fields).toContain("caption");
    expect(fields).not.toContain("media_product_type");
    expect(fields).toContain("media_type");
    expect(fields).toContain("media_url");
  });

  it("recovers the caption from the media object when the collection falls back without it", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(new Response(null, { status: 400 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "media-2",
                media_type: "IMAGE",
                permalink: "https://www.instagram.com/p/example-2",
                timestamp: "2026-09-18T08:00:00.000Z",
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "media-2", caption: "Le vrai nom du post" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const media = await listMedia("instagram-test-token");
    const captionRequestUrl = new URL(String(fetchMock.mock.calls[3]?.[0]));

    expect(media[0]?.caption).toBe("Le vrai nom du post");
    expect(media[0]?.captionFetched).toBe(true);
    expect(captionRequestUrl.pathname).toContain("/media-2");
    expect(captionRequestUrl.searchParams.get("fields")).toBe("caption");
  });

  it("does not request feed-only metrics for a Reel", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchMediaInsights(
      "instagram-test-token",
      "media-reel",
      "VIDEO",
      "https://www.instagram.com/reel/example",
    );

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const metrics = requestUrl.searchParams.get("metric") ?? "";

    expect(metrics).not.toContain("follows");
    expect(metrics).not.toContain("profile_visits");
    expect(metrics).not.toContain("impressions");
    expect(metrics).toContain("views");
  });

  it("keeps feed-only metrics for a video published in the feed", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchMediaInsights(
      "instagram-test-token",
      "media-feed-video",
      "VIDEO",
      "https://www.instagram.com/p/example",
    );

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const metrics = requestUrl.searchParams.get("metric") ?? "";

    expect(metrics).toContain("follows");
    expect(metrics).toContain("profile_visits");
  });
});
