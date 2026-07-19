"use server";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries, users } from "@/db/schema";
import { track } from "@/lib/analytics";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { METRIC_KEYS, type MetricKey } from "@/lib/diagnostic/benchmarks";
import { buildRates } from "@/lib/diagnostic/cascade";
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
}
