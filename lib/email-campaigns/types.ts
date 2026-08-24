export type EmailCampaignRow = {
  id: string;
  name: string;
  sentAt: string; // "YYYY-MM-DD"
  subject: string | null;
  body: string | null;
  sends: number;
  opens: number | null;
  clicks: number | null;
  revenueAttributed: number | null; // euros
  bookings: number | null; // RDV bookés attribués à cet envoi
  dealsClosed: number | null; // RDV closés attribués à cet envoi
  createdAt: string;
};

export type EmailCampaignMetrics = {
  openRate: number | null; // 0-1 fraction
  ctr: number | null; // 0-1 fraction, clicks / sends
};
