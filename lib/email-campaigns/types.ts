export type EmailCampaignRow = {
  id: string;
  name: string;
  sentAt: string; // "YYYY-MM-DD"
  subject: string | null;
  sends: number;
  opens: number | null;
  clicks: number | null;
  revenueAttributed: number | null; // euros
  createdAt: string;
};

export type EmailCampaignMetrics = {
  openRate: number | null; // 0-1 fraction
  ctr: number | null; // 0-1 fraction, clicks / sends
};
