"use server";

import { desc, eq } from "drizzle-orm";

import { saveMonthlyMetrics } from "@/app/(app)/datas/actions";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries, users } from "@/db/schema";
import { track } from "@/lib/analytics";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { buildRates, labelFor } from "@/lib/diagnostic/cascade";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { createClient } from "@/lib/supabase/server";

export type CheckinFeedback = { key: string; label: string; beforePercent: number; afterPercent: number } | null;

// Same 3-month aggregation window as lib/improve-chat-tracking.ts's
// snapshot, so the before/after comparison is apples-to-apples.
async function currentRateFor(userId: string, metricKey: string): Promise<number | null> {
  const [allSettingEntries, allClosingEntries, allMonthlyRows] = await Promise.all([
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, userId)).orderBy(desc(settingKpiEntries.date)),
    db.select().from(closingKpiEntries).where(eq(closingKpiEntries.userId, userId)).orderBy(desc(closingKpiEntries.date)),
    getAllMonthlyMetrics(userId),
  ]);
  const { settingTotals, closingTotals } = aggregatePeriodTotals({
    months: lastCompletedMonths(3),
    allMonthlyRows,
    allSettingEntries,
    allClosingEntries,
  });
  const rates = buildRates(settingTotals, closingTotals);
  return rates[metricKey as keyof typeof rates] ?? null;
}

export async function submitWeeklyCheckin(
  year: number,
  month: number,
  data: unknown
): Promise<{ error: string | null; feedback?: CheckinFeedback }> {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getClaims();
  if (!authData?.claims) {
    return { error: "Session expirée, reconnecte-toi." };
  }
  const userId = authData.claims.sub as string;

  const monthResult = await saveMonthlyMetrics(year, month, data);
  if (monthResult.error) return monthResult;

  await track("weekly_checkin_completed", userId);

  const [userRow] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  let feedback: CheckinFeedback = null;

  if (userRow?.lastImproveMetricKey && userRow.lastImproveMetricRateSnapshot !== null) {
    const metricKey = userRow.lastImproveMetricKey;
    const before = userRow.lastImproveMetricRateSnapshot;
    const after = await currentRateFor(userId, metricKey);

    if (after !== null) {
      feedback = {
        key: metricKey,
        label: labelFor(metricKey as Parameters<typeof labelFor>[0]),
        beforePercent: Math.round(before * 100),
        afterPercent: Math.round(after * 100),
      };
      // Rolling snapshot: next check-in compares against THIS one, not the
      // original chat-open moment.
      await db.update(users).set({ lastImproveMetricRateSnapshot: after }).where(eq(users.id, userId));
    }
  }

  return { error: null, feedback };
}
