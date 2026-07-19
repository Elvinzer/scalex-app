export type AdCampaignRow = {
  id: string;
  platform: string;
  name: string;
  objective: string | null;
  budget: number | null;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  startDate: string; // "YYYY-MM-DD"
  endDate: string | null;
  createdAt: string;
};

export type AdCampaignMetrics = {
  ctr: number | null; // 0-1 fraction
  costPerLead: number | null; // euros
  costPerClick: number | null; // euros
};
