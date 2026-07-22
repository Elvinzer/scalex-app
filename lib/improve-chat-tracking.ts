"use server";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { closingKpiEntries, improvementEvents, settingKpiEntries, users } from "@/db/schema";
import { track } from "@/lib/analytics";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { METRIC_KEYS, type MetricKey } from "@/lib/diagnostic/benchmarks";
import { buildRates, labelFor } from "@/lib/diagnostic/cascade";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { createClient } from "@/lib/supabase/server";

function isMetricKey(value: string): value is MetricKey {
  return (METRIC_KEYS as string[]).includes(value);
}

// Called from the client the moment the "Améliorer" drawer opens
// (components/floating-chat-bubble.tsx, app/(app)/diagnostic/auto-open-improve.tsx)
// — server-side per the analytics plan's "reliability first" rule. Also
// snapshots the metric's current rate onto users.lastImproveMetricKey/
// lastImproveMetricRateSnapshot (only for the 5 single-rate cascade
// metrics — "general"/"followupRecovery" aren't one comparable number) so
// the next weekly check-in can show a before/after.
export async function recordImproveChatOpened(metricKey: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return;
  const userId = data.claims.sub as string;

  await track("improve_chat_opened", userId, { metric_key: metricKey });

  if (!isMetricKey(metricKey)) return;

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

  const rate = buildRates(settingTotals, closingTotals)[metricKey];
  if (rate === null) return;

  await db
    .update(users)
    .set({ lastImproveMetricKey: metricKey, lastImproveMetricRateSnapshot: rate })
    .where(eq(users.id, userId));

  // Journal event — first time ever on this metric_key only. No history
  // table for "already discussed" exists (lastImproveMetricKey only ever
  // holds the most recent one), so this table itself is the dedup source:
  // an existing row for this (user, metric) means it isn't the first time.
  const [existing] = await db
    .select({ id: improvementEvents.id })
    .from(improvementEvents)
    .where(
      and(
        eq(improvementEvents.userId, userId),
        eq(improvementEvents.type, "copilote_started"),
        eq(improvementEvents.sourceId, metricKey)
      )
    )
    .limit(1);
  if (!existing) {
    await db.insert(improvementEvents).values({
      userId,
      date: new Date().toISOString().slice(0, 10),
      type: "copilote_started",
      label: `Travail commencé sur ${labelFor(metricKey)}`,
      sourceId: metricKey,
    });
  }
}
