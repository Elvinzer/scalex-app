import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { parseYoutubeReportingCsv } from "./reporting";

describe("YouTube Reporting CSV parser", () => {
  it("trims headers and values while preserving real zeroes", () => {
    const rows = parseYoutubeReportingCsv(
      "\uFEFF date , video_id , video_thumbnail_impressions , video_thumbnail_impressions_ctr \n 2026-09-20 , abc123 , 0 ,  \n",
    );

    expect(rows).toEqual([
      {
        date: "2026-09-20",
        video_id: "abc123",
        video_thumbnail_impressions: "0",
        video_thumbnail_impressions_ctr: "",
      },
    ]);
  });

  it("drops rows that contain no usable values", () => {
    expect(parseYoutubeReportingCsv("date,video_id\n,\n")).toEqual([]);
  });
});
