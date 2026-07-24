import { rate } from "@/lib/setting/funnel";

import type { EmailCampaignMetrics, EmailCampaignRow } from "./types";

export function computeEmailCampaignMetrics(campaign: EmailCampaignRow): EmailCampaignMetrics {
  return {
    openRate: rate(campaign.opens ?? 0, campaign.sends),
    ctr: rate(campaign.clicks ?? 0, campaign.sends),
  };
}
