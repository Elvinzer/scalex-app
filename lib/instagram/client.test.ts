import { afterEach, describe, expect, it, vi } from "vitest";

import { listMedia } from "./client";

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
    expect(fields).toContain("caption");
    expect(fields).not.toContain("media_product_type");
    expect(fields).toContain("media_type");
    expect(fields).toContain("media_url");
  });
});
