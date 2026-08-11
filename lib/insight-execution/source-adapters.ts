import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { contentRecommendations, funnelStageInsights, insightRecords, users } from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { getContentPosts } from "@/lib/content-posts/queries";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { computeDiagnosticPoints, computeMetricSummaries } from "@/lib/diagnostic/cascade";
import { aggregateContentTotals, computeContentMetricSummaries } from "@/lib/diagnostic/content-metrics";
import { getContentDiagnosticBenchmarks } from "@/lib/diagnostic/content-benchmarks";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { computeLeverOpportunities } from "@/lib/levers/opportunities";

import { materializeInsightSchema } from "./schemas";
import type {
  InsightDecision,
  InsightImpactProjection,
  InsightSnapshot,
  InsightSourceType,
} from "./types";
import { fingerprintInsight } from "./fingerprint";

const FUNNEL_STAGE_LABELS: Record<string, string> = {
  outreachRate: "Prise de contact",
  responseRate: "Taux de réponse",
  proposalRate: "Proposition d'appel",
  bookingRate: "Réservation d'appel",
  showUpRate: "Présence à l'appel",
  closingRate: "Closing",
};

const FUNNEL_STAGE_METRICS: Record<string, string | null> = {
  outreachRate: null,
  responseRate: "responseRate",
  proposalRate: "proposalRate",
  bookingRate: "bookingRate",
  showUpRate: "showUpRate",
  closingRate: "closingRate",
};

export type MaterializedInsight = {
  sourceType: InsightSourceType;
  sourceId: string;
  title: string;
  insightText: string;
  sourceLabel: string;
  metricKey: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  snapshot: InsightSnapshot;
  impactProjection: InsightImpactProjection | null;
  decision?: InsightDecision;
  // Optional stable identity for sources whose evidence changes on every
  // sync. Legacy sources keep the historical fingerprint derived from their
  // snapshot; Meta Ads supplies its campaign/rule/period identity explicitly.
  fingerprint?: string;
};

function periodForCurrentDiagnostic(): { start: string; end: string } {
  const months = lastCompletedMonths(3);
  return { start: months[0]!.range.from, end: months[months.length - 1]!.range.to };
}

async function diagnosticMetricInsight(accountId: string, sourceId: string): Promise<MaterializedInsight | null> {
  const [[user], businessProfile, rawData, allContentPosts] = await Promise.all([
    db.select({ sector: users.sector }).from(users).where(eq(users.id, accountId)).limit(1),
    getBusinessProfile(accountId),
    getDiagnosticKpiRawData(accountId),
    getContentPosts(accountId),
  ]);
  const benchmarks = await getDiagnosticBenchmarks(user?.sector ?? null);
  const contentBenchmarks = await getContentDiagnosticBenchmarks(user?.sector ?? null);
  const months = lastCompletedMonths(3);
  const totals = aggregatePeriodTotals({
    months,
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
  const points = computeDiagnosticPoints({
    settingTotals: totals.settingTotals,
    closingTotals: totals.closingTotals,
    benchmarks,
    businessProfile,
    cashContractedTotal: totals.cashContractedTotal,
  });
  const summary = computeMetricSummaries({ settingTotals: totals.settingTotals, closingTotals: totals.closingTotals, benchmarks }).find(
    (item) => item.key === sourceId,
  );
  const contentSummary = computeContentMetricSummaries({
    totals: aggregateContentTotals(months, allContentPosts, rawData.allVideoAttributionTotals),
    benchmarks: contentBenchmarks,
  }).find((item) => item.key === sourceId);
  const point = points.find((item) => item.key === sourceId);
  if (!summary && !point && !contentSummary) return null;
  const period = periodForCurrentDiagnostic();
  const title = point?.label ?? summary?.label ?? contentSummary?.label ?? sourceId;
  const current = point?.currentRatePercent ?? summary?.currentRatePercent ?? contentSummary?.currentRatePercent ?? null;
  const benchmark = point?.benchmarkRatePercent ?? summary?.benchmarkRatePercent ?? contentSummary?.benchmarkRatePercent ?? null;
  return {
    sourceType: "diagnostic_metric",
    sourceId,
    title: `Améliorer ${title}`,
    insightText:
      point?.explanation ??
      `${title} est actuellement à ${current === null ? "non mesuré" : `${current}%`}, pour un benchmark à ${benchmark === null ? "non mesuré" : `${benchmark}%`}.`,
    sourceLabel: contentSummary ? "Diagnostic · contenu" : "Diagnostic",
    metricKey: sourceId,
    periodStart: period.start,
    periodEnd: period.end,
    snapshot: {
      metricKey: sourceId,
      currentRatePercent: current,
      benchmarkRatePercent: benchmark,
      sampleSize: point?.extraClients ?? null,
      monthlyGainEur: point?.monthlyGain ?? null,
    },
    impactProjection:
      point?.monthlyGain === null || point?.monthlyGain === undefined
        ? null
        : { amountEur: point.monthlyGain, label: "Projection au benchmark" },
  };
}

async function diagnosticLeverInsight(accountId: string, sourceId: string): Promise<MaterializedInsight | null> {
  const [businessProfile, rawData] = await Promise.all([getBusinessProfile(accountId), getDiagnosticKpiRawData(accountId)]);
  const months = lastCompletedMonths(3);
  const totals = aggregatePeriodTotals({
    months,
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
  const { toImplement, toWatch } = await computeLeverOpportunities({
    accountId,
    businessProfile,
    settingTotals: totals.settingTotals,
    closingTotals: totals.closingTotals,
    cashContractedTotal: totals.cashContractedTotal,
    periodMonths: months.length,
    months,
  });
  const [leverKey, statKey] = sourceId.split(":", 2);
  const opportunity = [...toWatch, ...toImplement].find(
    (item) => item.leverKey === leverKey && (statKey === undefined || ("statKey" in item && item.statKey === statKey)),
  );
  if (!opportunity) return null;
  const selectedStatKey = "statKey" in opportunity && typeof opportunity.statKey === "string" ? opportunity.statKey : null;
  const rangeEur = "impactRangeEur" in opportunity ? opportunity.impactRangeEur ?? null : null;
  const currentValue = "statValue" in opportunity ? opportunity.statValue : null;
  const benchmarkValue = "benchmarkValue" in opportunity ? opportunity.benchmarkValue : null;
  return {
    sourceType: "diagnostic_lever",
    sourceId,
    title: `Améliorer ${opportunity.label}`,
    insightText: opportunity.impactExplanation,
    sourceLabel: "Diagnostic · leviers",
    metricKey: selectedStatKey,
    periodStart: months[0]?.range.from ?? null,
    periodEnd: months[months.length - 1]?.range.to ?? null,
    snapshot: {
      leverKey: opportunity.leverKey,
      statKey: selectedStatKey,
      currentValue,
      benchmarkValue,
      impactAmountEur: opportunity.impactAmountEur,
      impactRangeEur: rangeEur,
      effort: "effort" in opportunity ? opportunity.effort : "faible",
    },
    impactProjection: {
      amountEur: opportunity.impactAmountEur,
      rangeEur,
      label: "Estimation indicative",
    },
  };
}

async function funnelInsight(accountId: string, sourceId: string): Promise<MaterializedInsight | null> {
  const [row] = await db
    .select()
    .from(funnelStageInsights)
    .where(and(eq(funnelStageInsights.userId, accountId), eq(funnelStageInsights.id, sourceId)))
    .limit(1);
  if (!row) return null;
  const generatedDate = row.generatedAt.toISOString().slice(0, 10);
  const label = FUNNEL_STAGE_LABELS[row.stage] ?? row.stage;
  return {
    sourceType: "funnel_stage",
    sourceId,
    title: `Insight · ${label}`,
    insightText: row.insightText,
    sourceLabel: "Funnel",
    metricKey: FUNNEL_STAGE_METRICS[row.stage] ?? null,
    periodStart: generatedDate,
    periodEnd: generatedDate,
    snapshot: { stage: row.stage, answers: row.answers, generatedAt: row.generatedAt.toISOString() },
    impactProjection: null,
    decision: row.implemented === true ? "completed" : row.implemented === false ? "dismissed" : "todo",
  };
}

async function contentInsight(accountId: string, sourceId: string): Promise<MaterializedInsight | null> {
  const [row] = await db
    .select()
    .from(contentRecommendations)
    .where(and(eq(contentRecommendations.userId, accountId), eq(contentRecommendations.id, sourceId)))
    .limit(1);
  if (!row) return null;
  return {
    sourceType: "content_recommendation",
    sourceId,
    title: row.title,
    insightText: `${row.angle}. ${row.rationale}`,
    sourceLabel: "Contenu",
    metricKey: null,
    periodStart: row.createdAt.toISOString().slice(0, 10),
    periodEnd: row.createdAt.toISOString().slice(0, 10),
    snapshot: {
      angle: row.angle,
      rationale: row.rationale,
      sourceVideoIds: row.sourceVideoIds,
      estimatedViews: row.estImpact,
      effort: row.effort,
    },
    impactProjection: null,
  };
}

export async function resolveMaterializedInsight(accountId: string, input: unknown): Promise<MaterializedInsight | null> {
  const parsed = materializeInsightSchema.safeParse(input);
  if (!parsed.success) return null;
  if (parsed.data.sourceType === "copilote") return null;
  if (parsed.data.sourceType === "meta_ads") return null;
  if (parsed.data.sourceType === "diagnostic_metric") return diagnosticMetricInsight(accountId, parsed.data.sourceId);
  if (parsed.data.sourceType === "diagnostic_lever") return diagnosticLeverInsight(accountId, parsed.data.sourceId);
  if (parsed.data.sourceType === "funnel_stage") return funnelInsight(accountId, parsed.data.sourceId);
  return contentInsight(accountId, parsed.data.sourceId);
}

export async function upsertMaterializedInsight(accountId: string, insight: MaterializedInsight) {
  const fingerprint = insight.fingerprint ?? fingerprintInsight(insight);
  const [row] = await db
    .insert(insightRecords)
    .values({
      userId: accountId,
      sourceType: insight.sourceType,
      sourceId: insight.sourceId,
      fingerprint,
      title: insight.title,
      insightText: insight.insightText,
      sourceLabel: insight.sourceLabel,
      metricKey: insight.metricKey,
      periodStart: insight.periodStart,
      periodEnd: insight.periodEnd,
      snapshot: insight.snapshot,
      impactProjection: insight.impactProjection,
      decision: insight.decision ?? "todo",
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [insightRecords.userId, insightRecords.fingerprint],
      set: {
        title: insight.title,
        insightText: insight.insightText,
        sourceLabel: insight.sourceLabel,
        metricKey: insight.metricKey,
        periodStart: insight.periodStart,
        periodEnd: insight.periodEnd,
        snapshot: insight.snapshot,
        impactProjection: insight.impactProjection,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning();
  return row ?? null;
}

export async function materializeSourceInsight(accountId: string, input: unknown) {
  const resolved = await resolveMaterializedInsight(accountId, input);
  if (!resolved) return null;
  return upsertMaterializedInsight(accountId, resolved);
}

export async function materializeLatestFunnelInsights(accountId: string, limit = 20): Promise<void> {
  const rows = await db
    .select({ id: funnelStageInsights.id })
    .from(funnelStageInsights)
    .where(eq(funnelStageInsights.userId, accountId))
    .orderBy(desc(funnelStageInsights.generatedAt))
    .limit(limit);
  for (const row of rows) {
    const insight = await funnelInsight(accountId, row.id);
    if (insight) await upsertMaterializedInsight(accountId, insight);
  }
}
