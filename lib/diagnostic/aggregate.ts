import type { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import type { ClosingTotals } from "@/lib/closing/metrics";
import { inRange } from "@/lib/dashboard/metrics";
import { computeCompletion, monthStatus } from "@/lib/monthly-metrics/completion";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { resolveDailySourceOverlay, resolveMonthClosingTotals, resolveMonthSettingTotals } from "@/lib/monthly-metrics/resolve";
import { EMPTY_MONTHLY_METRICS } from "@/lib/monthly-metrics/types";
import type { FunnelTotals } from "@/lib/setting/funnel";
import { isMonthlyCallSourceAvailable, monthKey, type MonthlyCallSource } from "@/lib/monthly-metrics/call-source";
import type { SaleRow } from "@/lib/sales/types";
import type { LeadRow } from "@/lib/leads/types";
import { aggregateAcquisitionSources, emptyAcquisitionSourceTotals, type AcquisitionSourceTotals } from "@/lib/diagnostic/acquisition-sources";
import type { emailCampaigns, metaAdMetricsDaily, nativeBookingLeads } from "@/db/schema";

import type { MonthWindow } from "./completed-months";

type SettingEntry = typeof settingKpiEntries.$inferSelect;
type ClosingEntry = typeof closingKpiEntries.$inferSelect;

function sumFunnelTotals(totals: FunnelTotals[]): FunnelTotals {
  return totals.reduce(
    (sum, t) => ({
      newSubscribers: sum.newSubscribers + t.newSubscribers,
      firstMessagesSent: sum.firstMessagesSent + t.firstMessagesSent,
      conversationsStarted: sum.conversationsStarted + t.conversationsStarted,
      callsProposed: sum.callsProposed + t.callsProposed,
      callsBooked: sum.callsBooked + t.callsBooked,
    }),
    { newSubscribers: 0, firstMessagesSent: 0, conversationsStarted: 0, callsProposed: 0, callsBooked: 0 }
  );
}

function sumClosingTotals(totals: ClosingTotals[]): ClosingTotals {
  return totals.reduce(
    (sum, t) => ({ callsAttended: sum.callsAttended + t.callsAttended, salesClosed: sum.salesClosed + t.salesClosed }),
    { callsAttended: 0, salesClosed: 0 }
  );
}

export type PipelinePeriodTotals = {
  leads: number;
  worked: number;
  closed: number;
  conversations: number;
  callsBooked: number;
  callsTaken: number;
  salesClosed: number;
};

type LeadStageEvent = {
  leadId: string;
  toStage: LeadRow["stage"];
  changedAt: Date;
};

function addAcquisitionTotals(target: AcquisitionSourceTotals, source: AcquisitionSourceTotals): void {
  target.email.sends += source.email.sends;
  target.email.opens += source.email.opens;
  target.email.clicks += source.email.clicks;
  target.email.bookings += source.email.bookings;
  target.email.dealsClosed += source.email.dealsClosed;
  target.email.revenueAttributed += source.email.revenueAttributed;
  target.meta.spendCents += source.meta.spendCents;
  target.meta.impressions += source.meta.impressions;
  target.meta.linkClicks += source.meta.linkClicks;
  target.meta.leads += source.meta.leads;
  target.meta.registrations += source.meta.registrations;
  target.meta.purchases += source.meta.purchases;
  target.meta.purchaseValueCents += source.meta.purchaseValueCents;
  target.native.leads += source.native.leads;
  target.native.convertedLeads += source.native.convertedLeads;
}

// Sums resolveMonthSettingTotals/resolveMonthClosingTotals (monthly_metrics
// takes priority over daily entries per month, same rule as Datas/Funnel)
// across every month in `months`, plus whether any monthly_metrics row
// exists at all in the window (drives the "remplis au moins un mois" empty
// state — daily-entry-only periods don't count as "diagnostic-ready" since
// the spec's prerequisite is specifically about /datas).
export function aggregatePeriodTotals({
  months,
  allMonthlyRows,
  allSettingEntries,
  allClosingEntries,
  callSourcesByMonth = {},
  allSales = [],
  allLeads = [],
  allLeadStageHistory = [],
  allEmailCampaigns = [],
  allMetaMetrics = [],
  allNativeBookingLeads = [],
}: {
  months: MonthWindow[];
  allMonthlyRows: MonthlyMetricsRow[];
  allSettingEntries: SettingEntry[];
  allClosingEntries: ClosingEntry[];
  callSourcesByMonth?: Record<string, MonthlyCallSource>;
  allSales?: SaleRow[];
  allLeads?: LeadRow[];
  allLeadStageHistory?: LeadStageEvent[];
  allEmailCampaigns?: (typeof emailCampaigns.$inferSelect)[];
  allMetaMetrics?: (typeof metaAdMetricsDaily.$inferSelect)[];
  allNativeBookingLeads?: (typeof nativeBookingLeads.$inferSelect)[];
}): {
  settingTotals: FunnelTotals;
  closingTotals: ClosingTotals;
  cashContractedTotal: number;
  hasAnyMonthlyRow: boolean;
  hasAnySourceData: boolean;
  pipelineTotals: PipelinePeriodTotals;
  acquisitionTotals: AcquisitionSourceTotals;
  emptyMonths: MonthWindow[];
} {
  const perMonthSetting: FunnelTotals[] = [];
  const perMonthClosing: ClosingTotals[] = [];
  let cashContractedTotal = 0;
  let hasAnyMonthlyRow = false;
  let hasAnySourceData = false;
  const pipelineTotals: PipelinePeriodTotals = { leads: 0, worked: 0, closed: 0, conversations: 0, callsBooked: 0, callsTaken: 0, salesClosed: 0 };
  // Keep one set for the whole requested window. A lead can receive repeated
  // stage events across months; summing one distinct set per month would
  // silently inflate the cross-page pipeline totals.
  const pipelineLeadIds = {
    leads: new Set<string>(),
    worked: new Set<string>(),
    closed: new Set<string>(),
    salesClosed: new Set<string>(),
    conversations: new Set<string>(),
    callsBooked: new Set<string>(),
    callsTaken: new Set<string>(),
  };
  const acquisitionTotals = emptyAcquisitionSourceTotals();
  const emptyMonths: MonthWindow[] = [];

  for (const monthWindow of months) {
    const { year, month, range } = monthWindow;
    const monthlyRow = allMonthlyRows.find((row) => row.year === year && row.month === month) ?? null;
    const callSource = callSourcesByMonth[monthKey(year, month)] ?? null;
    const validSalesInMonth = allSales.filter((sale) => !sale.isOrphan && inRange(sale.saleDate, range));
    const hasSalesSource = validSalesInMonth.length > 0;
    for (const sale of validSalesInMonth) {
      if (sale.leadId === null) continue;
      pipelineLeadIds.worked.add(sale.leadId);
      pipelineLeadIds.closed.add(sale.leadId);
      pipelineLeadIds.salesClosed.add(sale.leadId);
    }
    const monthlyRowHasData = Boolean(
      monthlyRow &&
        [
          monthlyRow.cashCollected,
          monthlyRow.cashContracted,
          monthlyRow.newFollowers,
          monthlyRow.firstMessages,
          monthlyRow.conversations,
          monthlyRow.callsProposed,
          monthlyRow.callsBooked,
          monthlyRow.callsTaken,
          monthlyRow.salesClosed,
          monthlyRow.newCustomers,
        ].some((value) => value !== null && value !== undefined)
    );
    const monthlyAcquisitionHasData = Boolean(
      monthlyRow && Object.values(monthlyRow.acquisitionMetrics ?? {}).some((value) => typeof value === "number")
    );
    const monthAcquisitionTotals = aggregateAcquisitionSources({
      range,
      emailCampaigns: allEmailCampaigns,
      metaMetrics: allMetaMetrics,
      nativeBookingLeads: allNativeBookingLeads,
    });
    addAcquisitionTotals(acquisitionTotals, monthAcquisitionTotals);
    const leadsCreatedInMonth = allLeads.filter((lead) => {
      const inMonth = inRange(lead.createdAt.slice(0, 10), range);
      if (inMonth) pipelineLeadIds.leads.add(lead.id);
      return inMonth;
    }).length;
    for (const event of allLeadStageHistory) {
      if (!inRange(event.changedAt.toISOString().slice(0, 10), range)) continue;
      if (["conversation", "rdv_fixe", "rdv_honore", "close", "perdu"].includes(event.toStage)) {
        pipelineLeadIds.worked.add(event.leadId);
      }
      if (event.toStage === "close") {
        pipelineLeadIds.closed.add(event.leadId);
        pipelineLeadIds.salesClosed.add(event.leadId);
      }
      if (event.toStage === "conversation") pipelineLeadIds.conversations.add(event.leadId);
      if (event.toStage === "rdv_fixe") pipelineLeadIds.callsBooked.add(event.leadId);
      if (event.toStage === "rdv_honore") pipelineLeadIds.callsTaken.add(event.leadId);
    }
    if (monthlyRow) {
      hasAnyMonthlyRow = true;
    }

    const dailySetting = allSettingEntries.filter((entry) => inRange(entry.date, range));
    const dailyClosing = allClosingEntries.filter((entry) => inRange(entry.date, range));

    const baseSettingTotals = resolveMonthSettingTotals(monthlyRow, dailySetting);
    const baseClosingTotals = resolveMonthClosingTotals(monthlyRow, dailyClosing);
    const monthlySettingIsAuthoritative = Boolean(
      monthlyRow?.settingManualOverride ||
        (monthlyRow && ["newFollowers", "firstMessages", "conversations", "callsProposed", "callsBooked"].some((field) => monthlyRow[field as keyof typeof monthlyRow] !== null))
    );
    const monthlyClosingIsAuthoritative = Boolean(
      monthlyRow?.closingManualOverride ||
        (monthlyRow && ["callsTaken", "salesClosed"].some((field) => monthlyRow[field as keyof typeof monthlyRow] !== null))
    );
    const callSourceIsAvailable = isMonthlyCallSourceAvailable(callSource);

    // Integration data wins over a daily/manual call count when it exists.
    // The other Setting fields stay on their existing source, so adding a
    // connected scheduler never overwrites manually tracked acquisition data.
    const settingTotals = !monthlySettingIsAuthoritative && callSourceIsAvailable
      ? { ...baseSettingTotals, callsBooked: callSource.callsBooked }
      : baseSettingTotals;
    const closingTotals = monthlyClosingIsAuthoritative
      ? baseClosingTotals
      : {
          callsAttended: callSourceIsAvailable ? callSource.callsTaken : baseClosingTotals.callsAttended,
          // The Sales ledger is the canonical commercial event. It wins when
          // present; otherwise the call source/daily entry remains the
          // fallback. This prevents a closed call and its sale from being
          // counted twice while still making a standalone sale visible.
          salesClosed: hasSalesSource
            ? validSalesInMonth.length
            : callSourceIsAvailable
              ? callSource.salesClosed
              : baseClosingTotals.salesClosed,
        };

    // A manually entered sale is the canonical contracted-revenue event. The
    // monthly value remains a fallback for accounts that have not yet moved
    // their historical data into the Sales ledger.
    const monthSalesTotal = validSalesInMonth.reduce((sum, sale) => sum + sale.totalPrice, 0);
    cashContractedTotal += hasSalesSource ? monthSalesTotal : monthlyRow?.cashContracted ?? 0;

    perMonthSetting.push(settingTotals);
    perMonthClosing.push(closingTotals);

    if (
      monthlyRowHasData ||
      monthlyAcquisitionHasData ||
      dailySetting.length > 0 ||
      dailyClosing.length > 0 ||
      callSourceIsAvailable ||
      hasSalesSource ||
      leadsCreatedInMonth > 0 ||
      monthAcquisitionTotals.email.sends > 0 ||
      monthAcquisitionTotals.meta.impressions > 0 ||
      monthAcquisitionTotals.native.leads > 0
    ) {
      hasAnySourceData = true;
    }

    // Same "empty" definition /datas shows (month-card.tsx's monthStatus) —
    // a monthly_metrics row that exists but was cleared back to all-null
    // still counts as empty, not just "no row at all".
    const overlay = resolveDailySourceOverlay(range, allSettingEntries, allClosingEntries, {
      settingManualOverride: monthlyRow?.settingManualOverride,
      closingManualOverride: monthlyRow?.closingManualOverride,
    });
    const mergedData = {
      ...(monthlyRow ?? EMPTY_MONTHLY_METRICS),
      ...overlay.overrides,
      callsBooked: settingTotals.callsBooked,
      callsTaken: closingTotals.callsAttended,
      salesClosed: closingTotals.salesClosed,
      cashContracted: hasSalesSource ? monthSalesTotal : monthlyRow?.cashContracted ?? null,
    };
    if (
      !monthlyRow &&
      !dailySetting.length &&
      !dailyClosing.length &&
      !callSourceIsAvailable &&
      !hasSalesSource &&
      leadsCreatedInMonth === 0 &&
      monthAcquisitionTotals.email.sends === 0 &&
      monthAcquisitionTotals.meta.impressions === 0 &&
      monthAcquisitionTotals.native.leads === 0
    ) {
      emptyMonths.push(monthWindow);
    } else if (!monthlyAcquisitionHasData && monthStatus(computeCompletion(mergedData)) === "empty") {
      emptyMonths.push(monthWindow);
    }
  }

  pipelineTotals.leads = pipelineLeadIds.leads.size;
  pipelineTotals.worked = pipelineLeadIds.worked.size;
  pipelineTotals.closed = pipelineLeadIds.closed.size;
  pipelineTotals.conversations = pipelineLeadIds.conversations.size;
  pipelineTotals.callsBooked = pipelineLeadIds.callsBooked.size;
  pipelineTotals.callsTaken = pipelineLeadIds.callsTaken.size;
  pipelineTotals.salesClosed = pipelineLeadIds.salesClosed.size;

  return {
    settingTotals: sumFunnelTotals(perMonthSetting),
    closingTotals: sumClosingTotals(perMonthClosing),
    cashContractedTotal,
    hasAnyMonthlyRow,
    hasAnySourceData,
    pipelineTotals,
    acquisitionTotals,
    emptyMonths,
  };
}
