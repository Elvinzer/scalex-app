import { inRange } from "@/lib/dashboard/metrics";
import type { emailCampaigns, metaAdMetricsDaily, nativeBookingLeads } from "@/db/schema";

export type AcquisitionSourceTotals = {
  email: {
    sends: number;
    opens: number;
    clicks: number;
    bookings: number;
    dealsClosed: number;
    revenueAttributed: number;
  };
  meta: {
    spendCents: number;
    impressions: number;
    linkClicks: number;
    leads: number;
    registrations: number;
    purchases: number;
    purchaseValueCents: number;
  };
  native: {
    leads: number;
    convertedLeads: number;
  };
};

type EmailCampaign = typeof emailCampaigns.$inferSelect;
type MetaMetricRow = typeof metaAdMetricsDaily.$inferSelect;
type NativeBookingLead = typeof nativeBookingLeads.$inferSelect;

export function emptyAcquisitionSourceTotals(): AcquisitionSourceTotals {
  return {
    email: { sends: 0, opens: 0, clicks: 0, bookings: 0, dealsClosed: 0, revenueAttributed: 0 },
    meta: { spendCents: 0, impressions: 0, linkClicks: 0, leads: 0, registrations: 0, purchases: 0, purchaseValueCents: 0 },
    native: { leads: 0, convertedLeads: 0 },
  };
}

export function aggregateAcquisitionSources({
  range,
  emailCampaigns,
  metaMetrics,
  nativeBookingLeads,
}: {
  range: { from: string; to: string };
  emailCampaigns: EmailCampaign[];
  metaMetrics: MetaMetricRow[];
  nativeBookingLeads: NativeBookingLead[];
}): AcquisitionSourceTotals {
  const totals = emptyAcquisitionSourceTotals();

  for (const campaign of emailCampaigns) {
    if (!inRange(campaign.sentAt, range)) continue;
    totals.email.sends += campaign.sends;
    totals.email.opens += campaign.opens ?? 0;
    totals.email.clicks += campaign.clicks ?? 0;
    totals.email.bookings += campaign.bookings ?? 0;
    totals.email.dealsClosed += campaign.dealsClosed ?? 0;
    totals.email.revenueAttributed += campaign.revenueAttributed ?? 0;
  }

  for (const row of metaMetrics) {
    // Only campaign-level rows are canonical. Summing campaign + adset + ad
    // would count every Meta conversion several times.
    if (row.level !== "campaign" || !inRange(row.date, range)) continue;
    totals.meta.spendCents += row.spendCents;
    totals.meta.impressions += row.impressions;
    totals.meta.linkClicks += row.linkClicks;
    totals.meta.leads += row.leads;
    totals.meta.registrations += row.registrations;
    totals.meta.purchases += row.purchases;
    totals.meta.purchaseValueCents += row.purchaseValueCents;
  }

  for (const lead of nativeBookingLeads) {
    if (!inRange(lead.createdAt.toISOString().slice(0, 10), range)) continue;
    totals.native.leads += 1;
    if (lead.status === "converted") totals.native.convertedLeads += 1;
  }

  return totals;
}
