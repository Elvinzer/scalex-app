"use server";

import { and, desc, eq } from "drizzle-orm";

import { saveMonthlyMetrics } from "@/app/(app)/datas/actions";
import { db } from "@/db";
import { closingKpiEntries, improvementEvents, settingKpiEntries, users } from "@/db/schema";
import { track } from "@/lib/analytics";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { buildRates, labelFor } from "@/lib/diagnostic/cascade";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { requireUserIdOrError } from "@/lib/current-user";
import { revalidatePath } from "next/cache";
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

// "C'est fait" on the Action du jour. Diagnostic cascade points have no
// completion table of their own (unlike funnel_stage_insights, which
// setInsightImplemented covers) — so rather than inventing one, this logs the
// same improvement_events row the Journal calendar already reads, keyed by
// the metric. That makes the click a real, visible fact instead of a button
// that writes nowhere.
export async function markTodayActionDone(metricKey: string, label: string): Promise<{ error: string | null }> {
  const userId = await requireUserIdOrError();
  if (typeof userId !== "string") return userId;
  const access = await requirePermission(userId, "dashboard");
  if (!access) return { error: "Tu n'as pas accès à cette section." };

  const today = new Date().toISOString().slice(0, 10);

  // One row per metric per day — clicking twice shouldn't stack the journal.
  const [existing] = await db
    .select({ id: improvementEvents.id })
    .from(improvementEvents)
    .where(
      and(
        eq(improvementEvents.userId, access.accountId),
        eq(improvementEvents.date, today),
        eq(improvementEvents.type, "insight_implemented"),
        eq(improvementEvents.sourceId, metricKey)
      )
    )
    .limit(1);

  if (!existing) {
    await db.insert(improvementEvents).values({
      userId: access.accountId,
      date: today,
      type: "insight_implemented",
      label,
      sourceId: metricKey,
    });
    await track("insight_marked_done", userId, { metric_key: metricKey });
  }

  revalidatePath("/dashboard");
  revalidatePath("/journal");
  return { error: null };
}
