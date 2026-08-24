export type ClosingVideoOutcome = "closed" | "not_closed" | "pending";

export type FalcoCallRoadmapItem = {
  id: string;
  title: string;
  description: string;
};

export type CallRoadmapRecommendation = FalcoCallRoadmapItem & {
  href: string;
};

export type FalcoCallAnalysis = {
  score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  roadmap: FalcoCallRoadmapItem[];
  analyzedAt: string;
};

export type ClosingVideoRow = {
  id: string;
  salesCallId: string | null;
  clientName: string;
  callDate: string; // "YYYY-MM-DD"
  url: string | null;
  transcript: string | null;
  notes: string | null;
  outcome: ClosingVideoOutcome;
  falcoAnalysis: FalcoCallAnalysis | null;
  createdAt: string;
};

export type ClosingVideoCallOption = {
  id: string;
  label: string;
  scheduledAt: string;
};
