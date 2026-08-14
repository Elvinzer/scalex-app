import { describe, expect, it } from "vitest";

import { mergeConnectedPlatformPrefills, type ConnectedPlatformPrefill } from "./platform-prefill";
import type { Platform } from "./types";

const prefills: ConnectedPlatformPrefill[] = [
  { name: "Instagram", url: "https://www.instagram.com/minaly" },
  { name: "YouTube", url: "https://www.youtube.com/channel/UC123" },
];

describe("mergeConnectedPlatformPrefills", () => {
  it("selects connected platforms and adds their profile URLs", () => {
    const result = mergeConnectedPlatformPrefills([], prefills);

    expect(result).toEqual({
      changed: true,
      platforms: [
        { name: "Instagram", url: "https://www.instagram.com/minaly", postsPerWeek: null },
        { name: "YouTube", url: "https://www.youtube.com/channel/UC123", postsPerWeek: null },
      ],
    });
  });

  it("fills only blank URLs and preserves the user's existing values", () => {
    const platforms: Platform[] = [
      { name: "Instagram", url: "", postsPerWeek: 3 },
      { name: "YouTube", url: "https://youtube.com/custom", postsPerWeek: 1 },
      { name: "TikTok", url: "https://tiktok.com/@minaly", postsPerWeek: 5 },
    ];

    const result = mergeConnectedPlatformPrefills(platforms, prefills);

    expect(result.changed).toBe(true);
    expect(result.platforms).toEqual([
      { name: "Instagram", url: "https://www.instagram.com/minaly", postsPerWeek: 3 },
      { name: "YouTube", url: "https://youtube.com/custom", postsPerWeek: 1 },
      { name: "TikTok", url: "https://tiktok.com/@minaly", postsPerWeek: 5 },
    ]);
  });

  it("does not rewrite an already complete platform list", () => {
    const platforms: Platform[] = [
      { name: "Instagram", url: "https://www.instagram.com/minaly", postsPerWeek: 3 },
      { name: "YouTube", url: "https://youtube.com/custom", postsPerWeek: 1 },
    ];

    expect(mergeConnectedPlatformPrefills(platforms, prefills)).toEqual({ changed: false, platforms });
  });
});
