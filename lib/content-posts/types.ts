export type ContentPostType = "post" | "reel" | "story" | "video" | "live";

export type ContentPostRow = {
  id: string;
  platform: string;
  type: ContentPostType;
  title: string;
  publishedAt: string; // "YYYY-MM-DD"
  url: string | null;
  views: number;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  leads: number | null;
  createdAt: string;
};

export type ContentPostRates = {
  engagementRate: number | null;
  clickRate: number | null;
  viewToLeadRate: number | null;
};
