export type ClosingVideoOutcome = "closed" | "not_closed" | "pending";

export type ClosingVideoRow = {
  id: string;
  salesCallId: string | null;
  clientName: string;
  callDate: string; // "YYYY-MM-DD"
  url: string | null;
  transcript: string | null;
  notes: string | null;
  outcome: ClosingVideoOutcome;
  createdAt: string;
};

export type ClosingVideoCallOption = {
  id: string;
  label: string;
  scheduledAt: string;
};
