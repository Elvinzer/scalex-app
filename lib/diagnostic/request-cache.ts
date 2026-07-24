import { cache } from "react";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";

// Memoized per accountId for the lifetime of a single request — same
// pattern as lib/team/context.ts's getAccountContext (and now
// getBusinessProfile/getDiagnosticBenchmarks, wrapped the same way at their
// own definitions). app/(app)/layout.tsx (Scale Score badge, mounted on
// every page) and the page itself (Dashboard, Diagnostic, Overview,
// Copilote, Ads) were each independently re-running these same 3 queries;
// this collapses that into one round-trip per request. Downstream math
// (aggregatePeriodTotals, computeDiagnosticPoints, computeScaleScore...)
// still runs separately per caller — it's pure and cheap, only the DB reads
// were worth deduping.
export const getDiagnosticKpiRawData = cache(async (accountId: string) => {
  const [allSettingEntries, allClosingEntries, allMonthlyRows] = await Promise.all([
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, accountId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, accountId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(accountId),
  ]);

  return { allSettingEntries, allClosingEntries, allMonthlyRows };
});
