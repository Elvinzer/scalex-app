import { rate } from "@/lib/setting/funnel";

import type { AdCampaignMetrics, AdCampaignRow } from "./types";

// Null-safe €-per-unit division — distinct from rate() (which returns a 0-1
// fraction): cost per lead/click is a currency amount, not a percentage.
function costPer(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null || denominator <= 0) return null;
  return numerator / denominator;
}

export function computeCampaignMetrics(campaign: AdCampaignRow): AdCampaignMetrics {
  return {
    ctr: rate(campaign.clicks ?? 0, campaign.impressions ?? 0),
    costPerLead: costPer(campaign.spend, campaign.leads),
    costPerClick: costPer(campaign.spend, campaign.clicks),
  };
}
