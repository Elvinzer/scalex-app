"use server";

import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { closingKpiEntries, contentRecommendations, improvementEvents, settingKpiEntries, users } from "@/db/schema";
import { track } from "@/lib/analytics";
import { chatContextSchema, type ChatContext } from "@/lib/chat-context";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { METRIC_KEYS, type MetricKey } from "@/lib/diagnostic/benchmarks";
import { buildRates, labelFor } from "@/lib/diagnostic/cascade";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getAllMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/team/context";

function isMetricKey(value: string): value is MetricKey {
  return (METRIC_KEYS as string[]).includes(value);
}

// Called from the client the moment the "Améliorer" drawer opens
// (components/floating-chat-bubble.tsx, app/(app)/diagnostic/auto-open-improve.tsx,
// app/(app)/diagnostic/discovery-opportunity-card.tsx) — server-side per
// the analytics plan's "reliability first" rule. The single canonical
// improve_chat_opened event for every topic type (previously the lever
// cards fired a separate, disconnected opportunity_chat_opened instead —
// removed, this is the one source of truth now). Also snapshots the
// metric's current rate onto users.lastImproveMetricKey/
// lastImproveMetricRateSnapshot (only for topicType "metric" — a lever has
// no single comparable rate, extending this to levers is a separate
// follow-up, not part of this fix) so the next weekly check-in can show a
// before/after.
export async function recordImproveChatOpened(context: ChatContext, mode?: string | null): Promise<void> {
  const parsedContext = chatContextSchema.safeParse(context);
  if (!parsedContext.success) return;
  const safeContext = parsedContext.data;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return;
  const userId = data.claims.sub as string;

  await track("improve_chat_opened", userId, {
    topic_type: safeContext.topicType,
    topic_key: safeContext.topicKey,
    source_page: safeContext.sourcePage,
  });

  // Additive: the specific agent_key/mode pairing, alongside (not instead
  // of) the generic improve_chat_opened above — that event already powers
  // existing PostHog dashboards (lib/posthog-query.ts), this is scoped only
  // to lever-agent pages.
  if (safeContext.topicType === "lever" && safeContext.topicKey) {
    await track("agent_chat_opened", userId, { agent_key: safeContext.topicKey, mode: mode ?? null });
  }

  if (safeContext.topicType === "content_idea" && safeContext.topicKey) {
    const parsedRecommendationId = z.string().uuid().safeParse(safeContext.topicKey);
    const access = await requirePermission(userId, "acquisition:contenu");
    if (parsedRecommendationId.success && access) {
      await db
        .update(contentRecommendations)
        .set({ status: "building", updatedAt: new Date() })
        .where(
          and(
            eq(contentRecommendations.id, parsedRecommendationId.data),
            eq(contentRecommendations.userId, access.accountId),
            eq(contentRecommendations.status, "new")
          )
        );
      await track("content_reco_developed", userId, { reco_id: parsedRecommendationId.data });
    }
  }

  if (safeContext.topicType !== "metric" || !safeContext.topicKey || !isMetricKey(safeContext.topicKey)) return;
  const metricKey = safeContext.topicKey;

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

// Diagnostic's "Ajouter" section — distinct from the generic
// improve_chat_opened above, so the click ratio against "Points à
// améliorer" (tracked server-side in app/(app)/diagnostic/page.tsx via
// the existing ?open=/?openLever= query params — no client wiring needed
// there, the CTA is a plain navigating link) shows where user attention
// actually goes.
export async function recordDiagnosticAddClicked(leverKey: string): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) return;
  const userId = data.claims.sub as string;

  await track("diagnostic_add_clicked", userId, { lever: leverKey });
}
