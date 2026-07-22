"use server";

import { desc, eq } from "drizzle-orm";

import { saveMonthlyMetrics } from "@/app/(app)/datas/actions";
import { db } from "@/db";
import { closingKpiEntries, improvementEvents, settingKpiEntries, users } from "@/db/schema";
import { track } from "@/lib/analytics";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { buildRates, labelFor } from "@/lib/diagnostic/cascade";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

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
  const access = await requirePermission(userId, "dashboard");
  if (!access) return { error: "Tu n'as pas accès à cette section." };
  const { accountId } = access;

  const monthResult = await saveMonthlyMetrics(year, month, data);
  if (monthResult.error) return monthResult;

  await track("weekly_checkin_completed", userId);

  const [userRow] = await db.select().from(users).where(eq(users.id, accountId)).limit(1);
  let feedback: CheckinFeedback = null;

  if (userRow?.lastImproveMetricKey && userRow.lastImproveMetricRateSnapshot !== null) {
    const metricKey = userRow.lastImproveMetricKey;
    const before = userRow.lastImproveMetricRateSnapshot;
    const after = await currentRateFor(accountId, metricKey);

    if (after !== null) {
      feedback = {
        key: metricKey,
        label: labelFor(metricKey as Parameters<typeof labelFor>[0]),
        beforePercent: Math.round(before * 100),
        afterPercent: Math.round(after * 100),
      };
      // Rolling snapshot: next check-in compares against THIS one, not the
      // original chat-open moment.
      await db.update(users).set({ lastImproveMetricRateSnapshot: after }).where(eq(users.id, accountId));

      // Journal event — only on real improvement, captured NOW: there's no
      // history of before/after pairs (the snapshot above just rolled
      // forward), so this is the only moment this fact will ever exist.
      if (feedback.afterPercent > feedback.beforePercent) {
        await db.insert(improvementEvents).values({
          userId: accountId,
          date: new Date().toISOString().slice(0, 10),
          type: "checkin_rate_improved",
          label: `${feedback.label} : ${feedback.beforePercent} % → ${feedback.afterPercent} %`,
          sourceId: feedback.key,
        });
      }
    }
  }

  return { error: null, feedback };
}
