import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { leadStageHistory, leads } from "@/db/schema";
import type { SectorKey } from "@/lib/benchmarks";
import type { DateRange } from "@/lib/date-range";
import { computeMetricStatus, type MetricStatus } from "@/lib/diagnostic/cascade";
import { inRange } from "@/lib/dashboard/metrics";
import { getPipelineDiagnosticBenchmark } from "@/lib/diagnostic/pipeline-metrics";

import { getLeads } from "./queries";
import { getSales } from "@/lib/sales/queries";
import { LEAD_SOURCES, type LeadRow, type LeadSource, type LeadStage } from "./types";

// Mirrors lib/diagnostic/cascade.ts's own MIN_VOLUME (not exported from
// there) — kept in sync manually since this is a different denominator
// (leads travaillés, not calls/messages), not something that module can
// export directly.
const MIN_VOLUME = 30;
const CAUTION_THRESHOLD = 0.2;

const OPEN_STAGES: LeadStage[] = ["nouveau_lead", "conversation", "rdv_fixe", "rdv_honore"];
const WORKED_STAGES: LeadStage[] = ["conversation", "rdv_fixe", "rdv_honore", "close", "perdu"];

export type StatWithBenchmark = {
  current: number | null;
  volume: number;
  status: MetricStatus;
  benchmarkPercent: number;
};

export type ClosingBySourceRow = { source: LeadSource; leads: number; closed: number; rate: number | null };

export type PipelineStats = {
  conversationsCount: number;
  conversationsDelta: number | null;
  conversionRate: StatWithBenchmark;
  potentialInFollowupEur: number;
  failureRate: StatWithBenchmark;
  closingBySource: ClosingBySourceRow[];
};

// Inverted direction vs computeMetricStatus: LOWER is better for a failure
// rate, so "ok" means at-or-below the benchmark instead of at-or-above.
// Same MIN_VOLUME gate and caution-band width, just the comparison flipped
// — cascade.ts's own function isn't reusable as-is for an inverted metric.
function computeInvertedMetricStatus(current: number | null, benchmarkMax: number, volume: number): MetricStatus {
  if (current === null || volume < MIN_VOLUME) return "unmeasured";
  if (current <= benchmarkMax) return "ok";
  const relativeGap = (current - benchmarkMax) / benchmarkMax;
  return relativeGap < CAUTION_THRESHOLD ? "caution" : "critical";
}

// toStages filtering happens in JS rather than a drizzle `inArray` so every
// caller below (worked/conversation/closed/lost sets) can share one simple
// query shape — none of these sets are large enough for this to matter.
async function distinctLeadIdsWithTransition(userId: string, toStages: LeadStage[], range: DateRange): Promise<Set<string>> {
  const rows = await db
    .select({ leadId: leadStageHistory.leadId, toStage: leadStageHistory.toStage })
    .from(leadStageHistory)
    .innerJoin(leads, eq(leadStageHistory.leadId, leads.id))
    .where(
      and(
        eq(leads.userId, userId),
        gte(leadStageHistory.changedAt, new Date(`${range.from}T00:00:00Z`)),
        lte(leadStageHistory.changedAt, new Date(`${range.to}T23:59:59Z`))
      )
    );

  const ids = new Set<string>();
  for (const row of rows) {
    if (toStages.includes(row.toStage)) ids.add(row.leadId);
  }
  return ids;
}

// "Leads travaillés" (the taux de conversion/échec denominator) — assumed
// as leads that reached "conversation" or later at least once in the
// period (excluding leads still sitting untouched in "nouveau_lead").
// Product calibration, not verified data — easy to adjust here if wrong.
export async function computeLeadPipelineStats(
  userId: string,
  range: DateRange,
  previousRange: DateRange | null,
  sector: SectorKey | null,
  preloadedLeads?: LeadRow[],
): Promise<PipelineStats> {
  const [allLeads, workedIds, conversationIds, closedIds, lostIds, previousConversationIds, benchmarkValue, allSales] = await Promise.all([
    preloadedLeads ? Promise.resolve(preloadedLeads) : getLeads(userId),
    distinctLeadIdsWithTransition(userId, WORKED_STAGES, range),
    distinctLeadIdsWithTransition(userId, ["conversation"], range),
    distinctLeadIdsWithTransition(userId, ["close"], range),
    distinctLeadIdsWithTransition(userId, ["perdu"], range),
    previousRange ? distinctLeadIdsWithTransition(userId, ["conversation"], previousRange) : Promise.resolve(null),
    getPipelineDiagnosticBenchmark(sector),
    getSales(userId),
  ]);

  // A sale linked to a pipeline lead is the canonical commercial close even
  // when the lead-stage history was not updated. Fold that event into the
  // same denominator/numerator used by the pipeline view, while leaving
  // standalone sales to the closing funnel (there is no lead to attribute).
  for (const sale of allSales) {
    if (sale.isOrphan || sale.leadId === null || !inRange(sale.saleDate, range)) continue;
    workedIds.add(sale.leadId);
    closedIds.add(sale.leadId);
  }

  const volume = workedIds.size;
  const benchmarkPercent = Math.round(benchmarkValue * 100);

  const conversionCurrent = volume > 0 ? closedIds.size / volume : null;
  const conversionRate: StatWithBenchmark = {
    current: conversionCurrent,
    volume,
    status: computeMetricStatus(conversionCurrent, benchmarkValue, volume),
    benchmarkPercent,
  };

  const failureCurrent = volume > 0 ? lostIds.size / volume : null;
  const failureRate: StatWithBenchmark = {
    current: failureCurrent,
    volume,
    status: computeInvertedMetricStatus(failureCurrent, benchmarkValue, volume),
    benchmarkPercent,
  };

  const potentialInFollowupEur = allLeads
    .filter((lead) => OPEN_STAGES.includes(lead.stage))
    .reduce((sum, lead) => sum + lead.potentialValueEur, 0);

  const closingBySource = LEAD_SOURCES.map((source): ClosingBySourceRow => {
    const sourceLeads = allLeads.filter((lead: LeadRow) => lead.source === source && workedIds.has(lead.id));
    const sourceClosed = sourceLeads.filter((lead) => closedIds.has(lead.id));
    return {
      source,
      leads: sourceLeads.length,
      closed: sourceClosed.length,
      rate: sourceLeads.length > 0 ? sourceClosed.length / sourceLeads.length : null,
    };
  }).sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));

  return {
    conversationsCount: conversationIds.size,
    conversationsDelta: previousConversationIds ? conversationIds.size - previousConversationIds.size : null,
    conversionRate,
    potentialInFollowupEur,
    failureRate,
    closingBySource,
  };
}

const STAGE_TO_VOLUME_FIELD: Partial<Record<LeadStage, "conversations" | "callsBooked" | "callsTaken">> = {
  conversation: "conversations",
  rdv_fixe: "callsBooked",
  rdv_honore: "callsTaken",
};

// Same "single query for the whole year, bucket in JS" shape as
// getSalesSummaryByMonth/getPostLeadsSumByMonth — feeds the pipeline
// suggestion banners in datas/month-modal.tsx (never auto-applied there).
export async function getLeadPipelineVolumesByMonth(
  userId: string,
  year: number
): Promise<Record<number, { conversations: number; callsBooked: number; callsTaken: number }>> {
  const rows = await db
    .select({ leadId: leadStageHistory.leadId, toStage: leadStageHistory.toStage, changedAt: leadStageHistory.changedAt })
    .from(leadStageHistory)
    .innerJoin(leads, eq(leadStageHistory.leadId, leads.id))
    .where(
      and(
        eq(leads.userId, userId),
        gte(leadStageHistory.changedAt, new Date(`${year}-01-01T00:00:00Z`)),
        lte(leadStageHistory.changedAt, new Date(`${year}-12-31T23:59:59Z`))
      )
    );

  const byMonth: Record<number, { conversations: Set<string>; callsBooked: Set<string>; callsTaken: Set<string> }> = {};
  for (const row of rows) {
    const field = STAGE_TO_VOLUME_FIELD[row.toStage];
    if (!field) continue;
    const month = row.changedAt.getUTCMonth() + 1;
    const entry = byMonth[month] ?? { conversations: new Set(), callsBooked: new Set(), callsTaken: new Set() };
    entry[field].add(row.leadId);
    byMonth[month] = entry;
  }

  return Object.fromEntries(
    Object.entries(byMonth).map(([month, sets]) => [
      Number(month),
      { conversations: sets.conversations.size, callsBooked: sets.callsBooked.size, callsTaken: sets.callsTaken.size },
    ])
  );
}
