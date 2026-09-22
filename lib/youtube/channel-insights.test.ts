import { describe, expect, it } from "vitest";

import { channelTrafficSourcesForFormat } from "./channel-insights";

const rows = [
  { contentType: "VIDEO_ON_DEMAND", source: "YT_SEARCH", views: 80 },
  { contentType: "SHORTS", source: "SHORTS", views: 70 },
  { contentType: "UNSPECIFIED", source: "BROWSE", views: 10 },
];

describe("channel YouTube insights", () => {
  it("keeps the official content type boundary when splitting traffic", () => {
    expect(channelTrafficSourcesForFormat(rows, "long")).toEqual([rows[0]]);
    expect(channelTrafficSourcesForFormat(rows, "short")).toEqual([rows[1]]);
    expect(channelTrafficSourcesForFormat(rows, "all")).toEqual(rows);
  });
});
