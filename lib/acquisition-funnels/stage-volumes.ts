import type { AcquisitionSourceTotals } from "@/lib/diagnostic/acquisition-sources";
import type { ContentTotals } from "@/lib/diagnostic/content-metrics";
import type { ClosingTotals } from "@/lib/closing/metrics";
import type { FunnelTotals } from "@/lib/setting/funnel";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";

import type { AcquisitionFunnelCatalogEntry } from "./types";

/**
 * One canonical projection from the app's sources to a journey step.
 * Dashboard, Diagnostic and the conditional acquisition pages all consume
 * this projection.  A custom monthly value wins only when the user actually
 * entered one; otherwise the connected/manual source remains authoritative.
 */
export function buildAcquisitionStageVolumes({
  entry,
  monthlyRow,
  contentTotals,
  contentPostsCount,
  settingTotals,
  closingTotals,
  acquisitionTotals,
  hasSettingData,
  hasClosingData,
}: {
  entry: AcquisitionFunnelCatalogEntry;
  monthlyRow: MonthlyMetricsRow | null;
  contentTotals: ContentTotals;
  contentPostsCount: number;
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  acquisitionTotals: AcquisitionSourceTotals;
  hasSettingData: boolean;
  hasClosingData: boolean;
}): Record<string, number | null> {
  const values: Record<string, number | null> = {
    content_views: contentPostsCount > 0 ? contentTotals.views : null,
    content_clicks: contentTotals.samples.content_click_rate.posts > 0 ? contentTotals.clicks : null,
    content_leads: contentTotals.samples.content_lead_rate.posts > 0 ? contentTotals.leads : null,
    // A post view is not a VSL view. Keeping this null prevents a content
    // audience from being mistaken for people who watched the sales video.
    vsl_views: null,
    new_followers: hasSettingData ? settingTotals.newSubscribers : null,
    first_messages: hasSettingData ? settingTotals.firstMessagesSent : null,
    conversations: hasSettingData ? settingTotals.conversationsStarted : null,
    calls_proposed: hasSettingData ? settingTotals.callsProposed : null,
    calls_booked: hasSettingData ? settingTotals.callsBooked : null,
    calls_attended: hasClosingData ? closingTotals.callsAttended : null,
    sales_closed: hasClosingData ? closingTotals.salesClosed : null,
    newsletter_subscribers: acquisitionTotals.email.sends > 0 ? acquisitionTotals.email.sends : null,
    newsletter_opens: acquisitionTotals.email.opens > 0 ? acquisitionTotals.email.opens : null,
    newsletter_offer_clicks: acquisitionTotals.email.clicks > 0 ? acquisitionTotals.email.clicks : null,
  };

  for (const step of entry.steps) {
    const customValue = monthlyRow?.acquisitionMetrics?.[step.inputMetricKey];
    if (typeof customValue === "number") values[step.inputMetricKey] = customValue;
    else if (values[step.inputMetricKey] === undefined) values[step.inputMetricKey] = null;
  }

  return values;
}
