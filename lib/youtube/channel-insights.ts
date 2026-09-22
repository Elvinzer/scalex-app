import type { VideoFormat } from "./format";

// Values are kept as strings because YouTube can add a creator content type
// without changing the Analytics API contract. The UI only treats SHORTS and
// VIDEO_ON_DEMAND as the two formats it can compare safely.
export type YoutubeCreatorContentType = string;

export type YoutubeChannelTrafficSource = {
  contentType: YoutubeCreatorContentType;
  source: string;
  views: number;
};

export type YoutubeChannelSearchTerm = {
  term: string;
  views: number;
};

export type YoutubeChannelInsightsResult = {
  trafficSources: YoutubeChannelTrafficSource[];
  searchTerms: YoutubeChannelSearchTerm[];
  trafficSourcesAvailable: boolean;
  searchTermsAvailable: boolean;
};

export function channelTrafficSourcesForFormat(
  rows: YoutubeChannelTrafficSource[],
  format: VideoFormat,
): YoutubeChannelTrafficSource[] {
  if (format === "all") return rows;
  const expected = format === "short" ? "SHORTS" : "VIDEO_ON_DEMAND";
  return rows.filter((row) => row.contentType === expected);
}

