import { scoreAgainstBenchmark } from "@/lib/scoring";
import { rate } from "@/lib/setting/funnel";

import type { EmailCampaignMetrics, EmailCampaignRow } from "./types";

export function computeEmailCampaignMetrics(campaign: EmailCampaignRow): EmailCampaignMetrics {
  return {
    openRate: rate(campaign.opens ?? 0, campaign.sends),
    ctr: rate(campaign.clicks ?? 0, campaign.sends),
  };
}

// Same benchmark already used for the email_marketing lever's own
// "actifs à surveiller" scoring (levers_catalog.benchmarkValue, 0.35 open
// rate). No dedicated CTR benchmark exists for email_marketing in the
// catalog — this constant is the same order of magnitude as the
// "newsletter" lever's own ctr benchmark (0.03), a reasonable proxy rather
// than an invented number; adjustable here without touching call sites.
const OPEN_RATE_BENCHMARK = 0.35;
const EMAIL_CTR_BENCHMARK = 0.03;

// Per-campaign performance score (0-100), shown as a column in
// campaigns-table.tsx — distinct from the "Top" badge (best-CTR-of-the-month
// nudge, not a score). Averages openRate/ctr against their benchmarks via
// the same scoreAgainstBenchmark used for lever scoring; null when neither
// is measurable (no sends yet) rather than a fabricated score.
export function computeCampaignScore(campaign: EmailCampaignRow): number | null {
  const { openRate, ctr } = computeEmailCampaignMetrics(campaign);

  const scores = [
    openRate !== null ? scoreAgainstBenchmark(openRate, OPEN_RATE_BENCHMARK) : null,
    ctr !== null ? scoreAgainstBenchmark(ctr, EMAIL_CTR_BENCHMARK) : null,
  ].filter((score): score is number => score !== null);

  return scores.length > 0 ? Math.round(scores.reduce((sum, s) => sum + s, 0) / scores.length) : null;
}
