import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";

import { computeLeverOpportunities } from "./opportunities";

// Shared by Mail/Ads/Upsell's mode Démarrer — same 3-completed-months window
// and aggregation as app/(app)/diagnostic/page.tsx's own default period, just
// filtered down to the one lever this page cares about. Never called for a
// lever that's already "active" (computeLeverOpportunities only ever puts an
// "absent" lever into toImplement — see lib/levers/opportunities.ts).
export async function getLeverImpactEstimate(
  accountId: string,
  leverKey: string
): Promise<{ amountEur: number | null; explanation: string } | null> {
  const months = lastCompletedMonths(3);

  const [allSettingEntries, allClosingEntries, allMonthlyRows, businessProfile] = await Promise.all([
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, accountId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, accountId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(accountId),
    getBusinessProfile(accountId),
  ]);

  const { settingTotals, closingTotals, cashContractedTotal } = aggregatePeriodTotals({
    months,
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
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
  return opportunity ? { amountEur: opportunity.impactAmountEur, explanation: opportunity.impactExplanation } : null;
}
