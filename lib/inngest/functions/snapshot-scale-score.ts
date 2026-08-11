import { and, eq } from "drizzle-orm";
import { cron } from "inngest";

import { db } from "@/db";
import { scaleScoreHistory, users } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { computeScaleScore } from "@/lib/diagnostic/scale-score";
import { toIsoDate, todayUtc } from "@/lib/date-range";
import { inngest } from "@/lib/inngest/client";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";

// Second scheduled (cron-triggered) Inngest function in this codebase after
// lib/inngest/functions/weekly-brief-email.ts. Daily, 6am — one snapshot row
// per account per day, only when a score is actually computable (see
// computeScaleScore's ≥2-pillars-covered rule; accounts with nothing
// measurable simply get no row that day, not a fabricated 0). The badge/
// modal never read from this table for the CURRENT score — only for
// 7d/30d deltas and the 8-week sparkline (lib/scale-score-history/queries.ts).
export const snapshotScaleScore = inngest.createFunction(
  { id: "snapshot-scale-score", triggers: [cron("0 6 * * *")] },
  async ({ step }) => {
    const accounts = await step.run("load-accounts", async () => {
      return db
        .select()
        .from(users)
        .where(and(eq(users.onboardingCompleted, true), eq(users.isTestAccount, false)));
    });

    const today = toIsoDate(todayUtc());

    const results = await Promise.all(
      accounts.map((user) =>
        step.run(`snapshot-${user.id}`, async () => {
          const businessProfile = await getBusinessProfile(user.id);
          const rawData = await getDiagnosticKpiRawData(user.id);

          const { settingTotals, closingTotals, cashContractedTotal } = aggregatePeriodTotals({
            months: lastCompletedMonths(3),
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

          const benchmarks = await getDiagnosticBenchmarks(user.sector ?? null);
          const { score } = computeScaleScore({ settingTotals, closingTotals, benchmarks, businessProfile, cashContractedTotal });
          if (score === null) return { skipped: true };

          await db
            .insert(scaleScoreHistory)
            .values({ userId: user.id, date: today, score })
            .onConflictDoUpdate({ target: [scaleScoreHistory.userId, scaleScoreHistory.date], set: { score } });

          return { skipped: false };
        })
      )
    );

    return { total: accounts.length, snapshotted: results.filter((r) => !r.skipped).length };
  }
);
