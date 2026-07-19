export type ClosingVideoOutcome = "closed" | "not_closed" | "pending";

export type ClosingVideoRow = {
  id: string;
  clientName: string;
  callDate: string; // "YYYY-MM-DD"
  url: string | null;
  transcript: string | null;
  notes: string | null;
  outcome: ClosingVideoOutcome;
  createdAt: string;
};
