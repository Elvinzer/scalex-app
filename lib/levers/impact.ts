import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";

import { computeLeverOpportunities } from "./opportunities";

// Shared by Mail/Ads/Upsell's mode Démarrer — same 3-completed-months window
// and aggregation as app/(app)/diagnostic/page.tsx's own default period, just
// filtered down to the one lever this page cares about. Never called for a
// lever that's already "active" (computeLeverOpportunities only ever puts an
// "absent" lever into toImplement — see lib/levers/opportunities.ts).
export async function getLeverImpactEstimate(
  accountId: string,
  leverKey: string
): Promise<{
  amountEur: number | null;
  impactRangeEur: { min: number; max: number } | null;
  explanation: string;
  contextSentence: string | null;
  warning: string | null;
} | null> {
  const months = lastCompletedMonths(3);

  const [rawData, businessProfile] = await Promise.all([getDiagnosticKpiRawData(accountId), getBusinessProfile(accountId)]);

  const { settingTotals, closingTotals, cashContractedTotal } = aggregatePeriodTotals({
    months,
    allMonthlyRows: rawData.allMonthlyRows,
    allSettingEntries: rawData.allSettingEntries,
    allClosingEntries: rawData.allClosingEntries,
    callSourcesByMonth: rawData.allCallSourcesByMonth,
    allSales: rawData.allSales,
    allLeads: rawData.allLeads,
    allLeadStageHistory: rawData.allLeadStageHistory,
    allEmailCampaigns: rawData.allEmailCampaigns,
    allMetaMetrics: rawData.allMetaMetrics,
    allNativeBookingLeads: rawData.allNativeBookingLeads,
  });

  const { toImplement } = await computeLeverOpportunities({
    accountId,
    businessProfile,
    settingTotals,
    closingTotals,
    cashContractedTotal,
    periodMonths: months.length,
    months,
  });

  const opportunity = toImplement.find((o) => o.leverKey === leverKey);
  return opportunity
    ? {
        amountEur: opportunity.impactAmountEur,
        impactRangeEur: opportunity.impactRangeEur ?? null,
        explanation: opportunity.impactExplanation,
        contextSentence: opportunity.contextSentence ?? null,
        warning: opportunity.warning ?? null,
      }
    : null;
}
