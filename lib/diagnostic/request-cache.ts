import { cache } from "react";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { getAllMonthlyMetrics, getMonthlyCallSources } from "@/lib/monthly-metrics/queries";
import { monthKey } from "@/lib/monthly-metrics/call-source";

// Memoized per accountId for the lifetime of a single request — same
// pattern as lib/team/context.ts's getAccountContext (and now
// getBusinessProfile/getDiagnosticBenchmarks, wrapped the same way at their
// own definitions). app/(app)/layout.tsx (Scale Score badge, mounted on
// every page) and the page itself (Dashboard, Diagnostic, Overview,
// Copilote, Ads) were each independently re-running these same source reads;
// this collapses that into one batch per request. Downstream math
// (aggregatePeriodTotals, computeDiagnosticPoints, computeScaleScore...)
// still runs separately per caller — it's pure and cheap, only the DB reads
// were worth deduping.
export const getDiagnosticKpiRawData = cache(async (accountId: string) => {
  const [allSettingEntries, allClosingEntries, allMonthlyRows, allCallSourcesByMonth] = await Promise.all([
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, accountId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, accountId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(accountId),
    getMonthlyCallSources(accountId),
  ]);
  const monthsWithDailySetting = new Set(allSettingEntries.map((entry) => entry.date.slice(0, 7)));

  const resolvedMonthlyRows = allMonthlyRows.map((row) => {
    const key = monthKey(row.year, row.month);
    const callSource = allCallSourcesByMonth[key];
    if (!callSource) return row;
    return {
      ...row,
      ...(row.settingManualOverride || monthsWithDailySetting.has(key) ? {} : { callsBooked: callSource.callsBooked }),
      ...(row.closingManualOverride ? {} : { callsTaken: callSource.callsTaken, salesClosed: callSource.salesClosed }),
    };
  });

  return { allSettingEntries, allClosingEntries, allMonthlyRows: resolvedMonthlyRows, allCallSourcesByMonth };
});
