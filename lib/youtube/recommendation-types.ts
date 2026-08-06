// JSON-safe shapes shared by the recommendation engine, the database schema
// and Falco's content-idea prompt. These are deliberately evidence-first:
// every label can carry the videos and computed metrics it came from.

export type YoutubePatternExample = {
  videoId: string;
  title: string;
  views: number;
  revenueEur: number;
  conversionPerThousandViews: number | null;
  retentionPercent: number | null;
};

export type YoutubePatternGroup = {
  label: string;
  count: number;
  averageViews: number;
  averageRetentionPercent: number | null;
  examples: YoutubePatternExample[];
};

export type YoutubePatternLabel = {
  label: string;
  examples: string[];
};

export type YoutubeWinningPatternsSnapshot = {
  themes: YoutubePatternGroup[];
  formats: YoutubePatternGroup[];
  titleStructures: YoutubePatternLabel[];
  angles: YoutubePatternLabel[];
  topVideoIds: string[];
  analyzedVideoCount: number;
};

export type YoutubeRecommendationRecord = {
  id: string;
  title: string;
  angle: string;
  rationale: string;
  estImpact: number | null;
  impactBasis: string | null;
  effort: string;
  status: "new" | "building" | "filming" | "published";
  sourceVideoIds: string[];
  linkedVideoId: string | null;
  createdAt: Date;
  updatedAt: Date;
};
