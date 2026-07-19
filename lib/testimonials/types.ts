export type TestimonialFormat = "texte" | "video" | "capture_ecran" | "audio";

export type TestimonialRow = {
  id: string;
  clientName: string;
  format: TestimonialFormat;
  content: string | null;
  url: string | null;
  collectedAt: string; // "YYYY-MM-DD"
  createdAt: string;
};
