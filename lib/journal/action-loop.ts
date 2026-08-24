import { and, asc, desc, eq, inArray } from "drizzle-orm";

import {
  improvementEvents,
  improvementInitiatives,
  initiativeMeasurements,
  insightRecords,
  clientJourneys,
  clientReminders,
  settingKpiEntries,
  closingKpiEntries,
  users,
} from "@/db/schema";
import { getBusinessProfile } from "@/lib/business/queries";
import { getAcquisitionFunnelCatalog } from "@/lib/acquisition-funnels/queries";
import { activeLegacyMetricKeys, normalizeAcquisitionSelection } from "@/lib/acquisition-funnels/selection";
import { db } from "@/db";
import { aggregatePeriodTotals } from "@/lib/diagnostic/aggregate";
import { getDiagnosticBenchmarks } from "@/lib/diagnostic/benchmarks";
import { computeDiagnosticPoints, buildRates, labelFor } from "@/lib/diagnostic/cascade";
import { lastCompletedMonths } from "@/lib/diagnostic/completed-months";
import { getDiagnosticKpiRawData } from "@/lib/diagnostic/request-cache";
import { computeScaleScore } from "@/lib/diagnostic/scale-score";
import { getPriorityRules } from "@/lib/diagnostic/priority-rules";
import { scoreCandidates, type LeverCandidateInput } from "@/lib/diagnostic/priority";
import { toIsoDate, todayUtc } from "@/lib/date-range";
import { getContentRecommendations } from "@/lib/youtube/recommendations";
import { computeLeverOpportunities, type LeverOpportunity } from "@/lib/levers/opportunities";
import { getLeversCatalog } from "@/lib/levers/catalog";
import { getStarterPlan } from "@/lib/levers/starter-plan";
import type { MetricKey } from "@/lib/diagnostic/metric-keys";
import { calculateComparableMeasurement } from "@/lib/insight-execution/metrics";
import { recordInitiativeMeasured } from "@/lib/insight-execution/service";
import { getScaleScoreDelta } from "@/lib/scale-score-history/queries";
import { track } from "@/lib/analytics";
import { currentIsoWeekRange, inRange } from "@/lib/dashboard/metrics";
import { getSetters } from "@/lib/setters/queries";

import {
  makeCheckinAction,
  makeContentAction,
  makeLeadAction,
  makeLeverAction,
  makeMetricAction,
  sortJournalActions,
  type JournalActionCandidate,
  type JournalActionState,
  type JournalEffort,
} from "./action-generator";

const LOOKBACK_WEEKS = 12;
const MIN_RESULT_AGE_DAYS = 5;

type InsightRecordRow = typeof insightRecords.$inferSelect;
type InitiativeRow = typeof improvementInitiatives.$inferSelect;
type MeasurementRow = typeof initiativeMeasurements.$inferSelect;

export type JournalReminder = {
  id: string;
  leadName: string;
  note: string | null;
  reminderDate: string;
  overdueDays: number;
};

export type JournalResult = {
  id: string;
  title: string;
  sourceInsight: string;
  metricKey: string;
  metricLabel: string;
  completedAt: string;
  state: "positive" | "neutral" | "waiting";
  deltaValue: number | null;
  beforeValue: number | null;
  afterValue: number | null;
  sampleSize: number | null;
  measurementReason: string | null;
  chatContext: JournalActionCandidate["chatContext"];
};

export type JournalTimeline = {
  visible: boolean;
  selectedMetricKey: string | null;
  metrics: { key: string; label: string }[];
  points: { weekStart: string; label: string; value: number | null }[];
  seriesByMetric: Record<string, { weekStart: string; label: string; value: number | null }[]>;
  markers: { date: string; label: string; metricKey: string }[];
};

export type JournalMomentum = {
  actionsDoneThisWeek: number;
  scaleScoreDelta30d: number | null;
  activeWeekStreak: number;
};

export type RoadmapActionCategory = "content" | "sales" | "team";

export type RoadmapDailyAction = {
  category: RoadmapActionCategory;
  labelKey: RoadmapActionCategory | "organization";
  action: JournalActionCandidate | null;
};

export type RoadmapBottleneck = {
  key: MetricKey;
  label: string;
  category: "Setting" | "Closing";
  currentRatePercent: number;
  benchmarkRatePercent: number;
  monthlyGain: number | null;
  extraClients: number;
  href: string;
  chatContext: JournalActionCandidate["chatContext"];
};

export type RoadmapStage = "in_progress" | "upcoming" | "done";
export type RoadmapContentKind = "email" | "content";

export type RoadmapItem = {
  id: string;
  stage: RoadmapStage;
  type: "bottleneck" | "lever" | "content";
  sourceId: string;
  title: string;
  description: string;
  progress: number;
  impactAmountEur: number | null;
  href: string;
  contentKind?: RoadmapContentKind;
  staleDays?: number | null;
};

export type RoadmapClientReminder = {
  id: string;
  journeyId: string;
  clientName: string;
  note: string;
  remindAt: string;
  overdue: boolean;
};

export type JournalActionLoopData = {
  todayAction: JournalActionCandidate | null;
  nextActions: JournalActionCandidate[];
  allNextActions: JournalActionCandidate[];
  moreActionsCount: number;
  reminders: JournalReminder[];
  results: JournalResult[];
  timeline: JournalTimeline;
  momentum: JournalMomentum;
  emptyState: "insufficient_data" | "all_done" | null;
  dailyActions: RoadmapDailyAction[];
  bottleneck: RoadmapBottleneck | null;
  roadmapItems: RoadmapItem[];
  roadmapVisible: boolean;
  clientReminders: RoadmapClientReminder[];
  checkInDoneThisWeek: boolean;
};

function effort(value: string | null | undefined): JournalEffort {
  if (value === "eleve" || value === "élevé") return "eleve";
  if (value === "moyen") return "moyen";
  return "faible";
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function dateDifference(from: string, to: string): number {
  const fromDate = new Date(`${from}T00:00:00Z`);
  const toDate = new Date(`${to}T00:00:00Z`);
  return Math.max(0, Math.floor((fromDate.getTime() - toDate.getTime()) / 86_400_000));
}

function mondayOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - offset);
  return monday;
}

function weekStartForIso(value: string): string {
  return isoDate(mondayOfWeek(new Date(`${value}T00:00:00Z`)));
}

function formatWeekLabel(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function isMetricKey(value: string | null): value is MetricKey {
  return value !== null && ["responseRate", "proposalRate", "bookingRate", "showUpRate", "closingRate"].includes(value);
}

function sourceRecordMap(rows: InsightRecordRow[]): Map<string, InsightRecordRow> {
  const map = new Map<string, InsightRecordRow>();
  for (const row of rows) {
    const key = `${row.sourceType}:${row.sourceId}`;
    const previous = map.get(key);
    if (!previous || row.createdAt.getTime() > previous.createdAt.getTime()) map.set(key, row);
  }
  return map;
}

function initiativeMap(rows: InitiativeRow[]): Map<string, InitiativeRow> {
  return new Map(rows.map((row) => [row.insightRecordId, row]));
}

function latestMeasurementMap(rows: MeasurementRow[]): Map<string, MeasurementRow> {
  const map = new Map<string, MeasurementRow>();
  for (const row of rows) {
    const previous = map.get(row.initiativeId);
    if (!previous || row.version > previous.version) map.set(row.initiativeId, row);
  }
  return map;
}

function actionState(
  record: InsightRecordRow | undefined,
  initiative: InitiativeRow | undefined,
  today: string,
): JournalActionState {
  if (record?.decision === "dismissed" || initiative?.status === "cancelled") return "dismissed";
  if (record?.decision === "completed" || ["completed", "awaiting_measurement", "measured"].includes(initiative?.status ?? "")) return "done";
  if (record?.decision === "later" && record.resumeAt && record.resumeAt > today) return "snoozed";
  if (["planned", "in_progress", "paused"].includes(initiative?.status ?? "") || record?.decision === "launched") return "doing";
  return "pending";
}

function actionTiming(
  record: InsightRecordRow | undefined,
  initiative: InitiativeRow | undefined,
  today: string,
): { dueDate: string | null; createdAt: string | null; doneAt: string | null; resumeAt: string | null; overdueDays: number } {
  const dueDate = initiative?.dueDate ?? null;
  return {
    dueDate,
    createdAt: (initiative?.createdAt ?? record?.createdAt)?.toISOString() ?? null,
    doneAt: initiative?.completedAt?.toISOString() ?? null,
    resumeAt: record?.resumeAt ?? initiative?.snoozedUntil ?? null,
    overdueDays: dueDate && dueDate < today ? dateDifference(today, dueDate) : 0,
  };
}

function buildWeeklySeries(
  settingRows: (typeof settingKpiEntries.$inferSelect)[],
  closingRows: (typeof closingKpiEntries.$inferSelect)[],
  metricKey: string | null,
  today: Date,
): JournalTimeline["points"] {
  if (!isMetricKey(metricKey)) return [];

  const settingByWeek = new Map<string, { newSubscribers: number; firstMessagesSent: number; conversationsStarted: number; callsProposed: number; callsBooked: number }>();
  const closingByWeek = new Map<string, { callsAttended: number; salesClosed: number }>();
  for (const row of settingRows) {
    const week = weekStartForIso(row.date);
    const totals = settingByWeek.get(week) ?? { newSubscribers: 0, firstMessagesSent: 0, conversationsStarted: 0, callsProposed: 0, callsBooked: 0 };
    totals.newSubscribers += row.newSubscribers;
    totals.firstMessagesSent += row.firstMessagesSent;
    totals.conversationsStarted += row.conversationsStarted;
    totals.callsProposed += row.callsProposed;
    totals.callsBooked += row.callsBooked;
    settingByWeek.set(week, totals);
  }
  for (const row of closingRows) {
    const week = weekStartForIso(row.date);
    const totals = closingByWeek.get(week) ?? { callsAttended: 0, salesClosed: 0 };
    totals.callsAttended += row.callsAttended;
    totals.salesClosed += row.salesClosed;
    closingByWeek.set(week, totals);
  }

  const currentMonday = mondayOfWeek(today);
  const points: JournalTimeline["points"] = [];
  for (let offset = LOOKBACK_WEEKS - 1; offset >= 0; offset -= 1) {
    const week = new Date(currentMonday);
    week.setUTCDate(week.getUTCDate() - offset * 7);
    const weekStart = isoDate(week);
    const setting = settingByWeek.get(weekStart) ?? { newSubscribers: 0, firstMessagesSent: 0, conversationsStarted: 0, callsProposed: 0, callsBooked: 0 };
    const closing = closingByWeek.get(weekStart) ?? { callsAttended: 0, salesClosed: 0 };
    const rate = buildRates(setting, closing)[metricKey];
    points.push({ weekStart, label: formatWeekLabel(weekStart), value: rate === null ? null : Math.round(rate * 100) });
  }
  return points;
}

function buildTimeline(
  results: JournalResult[],
  settingRows: (typeof settingKpiEntries.$inferSelect)[],
  closingRows: (typeof closingKpiEntries.$inferSelect)[],
  today: Date,
): JournalTimeline {
  const metricCounts = new Map<string, number>();
  for (const result of results) metricCounts.set(result.metricKey, (metricCounts.get(result.metricKey) ?? 0) + 1);
  const metrics = [...metricCounts.keys()]
    .filter(isMetricKey)
    .sort((left, right) => (metricCounts.get(right) ?? 0) - (metricCounts.get(left) ?? 0))
    .map((key) => ({ key, label: labelFor(key) }));
  const selectedMetricKey = metrics[0]?.key ?? null;
  const seriesByMetric = Object.fromEntries(
    metrics.map((metric) => [metric.key, buildWeeklySeries(settingRows, closingRows, metric.key, today)]),
  );
  const points = selectedMetricKey ? seriesByMetric[selectedMetricKey] ?? [] : [];
  const markers = results
    .filter((result) => result.metricKey === selectedMetricKey)
    .map((result) => ({ date: result.completedAt.slice(0, 10), label: result.title, metricKey: result.metricKey }));

  return {
    visible: results.length >= 2 && points.some((point) => point.value !== null),
    selectedMetricKey,
    metrics,
    points,
    seriesByMetric,
    markers,
  };
}

function buildActiveWeekStreak(completedDates: string[], today: Date): number {
  const activeWeeks = new Set(completedDates.map(weekStartForIso));
  let streak = 0;
  const cursor = mondayOfWeek(today);
  while (activeWeeks.has(isoDate(cursor))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 7);
  }
  return streak;
}

function isOpenRoadmapAction(action: JournalActionCandidate): boolean {
  return action.status !== "dismissed" && action.status !== "snoozed";
}

function normalizedText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function chooseRoadmapAction(
  actions: JournalActionCandidate[],
  usedIds: Set<string>,
  predicate: (action: JournalActionCandidate) => boolean,
): JournalActionCandidate | null {
  const candidate = sortJournalActions(actions).find((action) => isOpenRoadmapAction(action) && !usedIds.has(action.id) && predicate(action));
  if (candidate) usedIds.add(candidate.id);
  return candidate ?? null;
}

function buildDailyActions(actions: JournalActionCandidate[], hasTeamMember: boolean): RoadmapDailyAction[] {
  const usedIds = new Set<string>();
  const content = chooseRoadmapAction(actions, usedIds, (action) =>
    action.type === "content" ||
    (action.type === "lever" && Boolean(action.sourceId.toLowerCase().match(/content|youtube|email|newsletter|webinar|instagram|seo/))),
  );
  const sales = chooseRoadmapAction(actions, usedIds, (action) =>
    action.type === "lead_reminder" || action.type === "bottleneck" || (action.type === "lever" && normalizedText(action.sourceInsight).includes("vente")),
  );
  const team = chooseRoadmapAction(actions, usedIds, (action) => action.type === "lever" && normalizedText(action.sourceInsight).includes("delivrabilite"));

  return [
    { category: "content", labelKey: "content", action: content },
    { category: "sales", labelKey: "sales", action: sales },
    { category: "team", labelKey: hasTeamMember ? "team" : "organization", action: team },
  ];
}

type RoadmapStaleActivity = {
  kind: RoadmapContentKind;
  title: string | null;
  staleDays: number | null;
  sourceId: string;
  href: string;
};

function latestIsoDate(values: string[]): string | null {
  return values.reduce<string | null>((latest, value) => {
    if (!value) return latest;
    return latest === null || value > latest ? value : latest;
  }, null);
}

function chooseStaleRoadmapActivity(
  today: string,
  emailCampaigns: Array<{ id: string; sentAt: string }>,
  contentPosts: Array<{ publishedAt: string }>,
  contentRecommendations: Array<{ id: string; title: string; status: string }>,
): RoadmapStaleActivity {
  const latestEmail = latestIsoDate(emailCampaigns.map((campaign) => campaign.sentAt));
  const latestContent = latestIsoDate(contentPosts.map((post) => post.publishedAt));
  const contentRecommendation = contentRecommendations.find((recommendation) => recommendation.status === "new" || recommendation.status === "building");

  const candidates = [
    {
      kind: "email" as const,
      title: null,
      staleDays: latestEmail === null ? null : Math.max(1, dateDifference(today, latestEmail)),
      sourceId: emailCampaigns.find((campaign) => campaign.sentAt === latestEmail)?.id ?? "email-gap",
      href: "/acquisition/mail",
      ageScore: latestEmail === null ? Number.MAX_SAFE_INTEGER : dateDifference(today, latestEmail),
      preference: 0,
    },
    {
      kind: "content" as const,
      title: contentRecommendation?.title ?? null,
      staleDays: latestContent === null ? null : Math.max(1, dateDifference(today, latestContent)),
      sourceId: contentRecommendation?.id ?? "content-gap",
      href: "/acquisition/contenu",
      ageScore: latestContent === null ? Number.MAX_SAFE_INTEGER : dateDifference(today, latestContent),
      preference: contentRecommendation ? 1 : 0,
    },
  ];

  candidates.sort((left, right) => right.ageScore - left.ageScore || right.preference - left.preference);
  return candidates[0];
}

function progressForAction(action: JournalActionCandidate | undefined): number {
  if (!action || action.status === "pending" || action.status === "snoozed" || action.status === "dismissed") return 0;
  return action.status === "done" ? 100 : 50;
}

function buildFocusedRoadmapItems({
  actions,
  bottleneck,
  staleActivity,
  absentLevers,
  starterByLever,
}: {
  actions: JournalActionCandidate[];
  bottleneck: RoadmapBottleneck | null;
  staleActivity: RoadmapStaleActivity;
  absentLevers: LeverOpportunity[];
  starterByLever: Map<string, string | null>;
}): RoadmapItem[] {
  const items: RoadmapItem[] = [];

  if (bottleneck) {
    const action = actions.find((candidate) => candidate.type === "bottleneck" && candidate.sourceId === bottleneck.key);
    items.push({
      id: action?.id ?? `diagnostic_metric:${bottleneck.key}`,
      stage: "in_progress",
      type: "bottleneck",
      sourceId: bottleneck.key,
      title: action?.title ?? "",
      description: bottleneck.label,
      progress: progressForAction(action),
      impactAmountEur: bottleneck.monthlyGain,
      href: bottleneck.href,
    });
  }

  items.push({
    id: `roadmap:${staleActivity.kind}`,
    stage: "upcoming",
    type: "content",
    sourceId: staleActivity.sourceId,
    title: staleActivity.title ?? "",
    description: "",
    progress: 0,
    impactAmountEur: null,
    href: staleActivity.href,
    contentKind: staleActivity.kind,
    staleDays: staleActivity.staleDays,
  });

  const reasonableEffort = absentLevers.find((item) => effort(item.effort) !== "eleve" && item.impactAmountEur !== null);
  const bestAbsentLever = reasonableEffort ?? absentLevers.find((item) => item.impactAmountEur !== null) ?? absentLevers[0];
  if (bestAbsentLever) {
    const action = actions.find((candidate) => candidate.type === "lever" && candidate.sourceId === bestAbsentLever.leverKey);
    items.push({
      id: action?.id ?? `diagnostic_lever:${bestAbsentLever.leverKey}`,
      stage: "upcoming",
      type: "lever",
      sourceId: bestAbsentLever.leverKey,
      title: action?.title ?? starterByLever.get(bestAbsentLever.leverKey) ?? bestAbsentLever.label,
      description: bestAbsentLever.label,
      progress: progressForAction(action),
      impactAmountEur: bestAbsentLever.impactAmountEur,
      href: action?.href ?? `/demarrer/${encodeURIComponent(bestAbsentLever.leverKey)}`,
    });
  }

  return items;
}

function buildResult(
  record: InsightRecordRow,
  initiative: InitiativeRow,
  measurement: MeasurementRow | undefined,
  today: string,
): JournalResult | null {
  if (!isMetricKey(record.metricKey) || !initiative.completedAt) return null;
  const completedAt = initiative.completedAt.toISOString();
  const age = dateDifference(today, completedAt.slice(0, 10));
  if (age < MIN_RESULT_AGE_DAYS && !measurement) return null;
  const delta = measurement?.deltaValue ?? null;
  return {
    id: initiative.id,
    title: initiative.title,
    sourceInsight: record.sourceLabel ?? "Diagnostic",
    metricKey: record.metricKey,
    metricLabel: labelFor(record.metricKey),
    completedAt,
    state: measurement ? delta !== null && delta > 0 ? "positive" : "neutral" : "waiting",
    deltaValue: delta,
    beforeValue: measurement?.beforeValue ?? null,
    afterValue: measurement?.afterValue ?? null,
    sampleSize: measurement?.sampleSize ?? null,
    measurementReason: measurement ? null : age >= MIN_RESULT_AGE_DAYS ? "En attente de tes prochains chiffres." : `Encore ${MIN_RESULT_AGE_DAYS - age} jour${MIN_RESULT_AGE_DAYS - age > 1 ? "s" : ""} avant le prochain repère.`,
    chatContext: {
      topicType: "metric",
      topicKey: record.metricKey,
      topicLabel: labelFor(record.metricKey),
      sourcePage: "journal_result",
    },
  };
}

export async function getJournalActionLoopData(accountId: string): Promise<JournalActionLoopData> {
  const now = todayUtc();
  const today = toIsoDate(now);
  const [businessProfile, [user], rawData, contentRows, setterRows, records, initiatives, measurements, events, priorityRules, leverCatalog, acquisitionCatalog, clientReminderRows] = await Promise.all([
    getBusinessProfile(accountId),
    db.select({ sector: users.sector }).from(users).where(eq(users.id, accountId)).limit(1),
    getDiagnosticKpiRawData(accountId),
    getContentRecommendations(accountId),
    getSetters(accountId),
    db.select().from(insightRecords).where(eq(insightRecords.userId, accountId)).orderBy(desc(insightRecords.createdAt)),
    db.select().from(improvementInitiatives).where(eq(improvementInitiatives.userId, accountId)).orderBy(desc(improvementInitiatives.createdAt)),
    db.select().from(initiativeMeasurements).where(eq(initiativeMeasurements.userId, accountId)).orderBy(desc(initiativeMeasurements.version)),
    db.select().from(improvementEvents).where(eq(improvementEvents.userId, accountId)).orderBy(desc(improvementEvents.createdAt)),
    getPriorityRules(),
    getLeversCatalog(),
    getAcquisitionFunnelCatalog(),
    db
      .select({ id: clientReminders.id, journeyId: clientReminders.clientJourneyId, clientName: clientJourneys.clientName, note: clientReminders.note, remindAt: clientReminders.remindAt })
      .from(clientReminders)
      .innerJoin(clientJourneys, eq(clientReminders.clientJourneyId, clientJourneys.id))
      .where(and(eq(clientReminders.userId, accountId), eq(clientReminders.completed, false)))
      .orderBy(asc(clientReminders.remindAt))
      .limit(20),
  ]);
  const acquisitionSelection = normalizeAcquisitionSelection(businessProfile.acquisition, acquisitionCatalog);
  const activeMetricKeys = activeLegacyMetricKeys(acquisitionSelection, acquisitionCatalog);

  const leadRows = rawData.allLeads;
  const salesTeamRows = rawData.allSales.filter((sale) => Boolean(sale.setterId || sale.closer?.trim()));

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
  const benchmarks = await getDiagnosticBenchmarks(user?.sector ?? null);
  const points = totals.hasAnySourceData
    ? computeDiagnosticPoints({
        settingTotals: totals.settingTotals,
        closingTotals: totals.closingTotals,
        benchmarks,
        businessProfile,
        cashContractedTotal: totals.cashContractedTotal,
        activeMetricKeys,
      })
    : [];
  const opportunities = totals.hasAnySourceData
    ? await computeLeverOpportunities({
        accountId,
        businessProfile,
        settingTotals: totals.settingTotals,
        closingTotals: totals.closingTotals,
        cashContractedTotal: totals.cashContractedTotal,
        periodMonths: months.length,
        months,
      })
    : { toImplement: [], toWatch: [], strong: [] };

  const leverPriorityInputs: LeverCandidateInput[] = [
    ...opportunities.toWatch.map((item) => ({
      leverKey: item.leverKey,
      label: item.label,
      category: item.category,
      impactAmountEur: item.impactAmountEur,
      effort: effort(leverCatalog.find((entry) => entry.leverKey === item.leverKey)?.effort),
      healthScore: item.score,
      isActive: true,
    })),
    ...opportunities.toImplement.map((item) => ({
      leverKey: item.leverKey,
      label: item.label,
      category: item.category,
      impactAmountEur: item.impactAmountEur,
      effort: effort(item.effort),
      healthScore: 40,
      isActive: false,
    })),
  ];
  const priorityRecommendations = scoreCandidates({
    points,
    leverCandidates: leverPriorityInputs,
    businessProfile,
    monthlyRevenueEur: totals.cashContractedTotal / months.length,
    rules: priorityRules,
  });
  const priorityBySource = new Map(priorityRecommendations.map((recommendation) => [`${recommendation.candidate.type}:${recommendation.candidate.key}`, recommendation.breakdown.score]));
  const recordsBySource = sourceRecordMap(records);
  const initiativesByInsight = initiativeMap(initiatives);
  const measurementsByInitiative = latestMeasurementMap(measurements);
  const completedMetricEvents = new Set(
    events.filter((event) => event.type === "insight_implemented").map((event) => event.sourceId).filter((sourceId): sourceId is string => sourceId !== null),
  );

  const actions: JournalActionCandidate[] = [];
  const planRows = await Promise.all(opportunities.toImplement.map(async (item) => ({ key: item.leverKey, steps: await getStarterPlan(item.leverKey) })));
  const starterByLever = new Map(planRows.map((row) => [row.key, row.steps?.[0]?.title ?? null]));

  for (const point of points) {
    const sourceId = point.key;
    const record = recordsBySource.get(`diagnostic_metric:${sourceId}`);
    const initiative = record ? initiativesByInsight.get(record.id) : undefined;
    const timing = actionTiming(record, initiative, today);
    const status = completedMetricEvents.has(sourceId) && !record ? "done" : actionState(record, initiative, today);
    actions.push(makeMetricAction({
      key: point.key,
      label: point.label,
      category: point.category,
      explanation: point.explanation,
      monthlyGainEur: point.monthlyGain,
      extraClients: point.extraClients,
      priorityScore: priorityBySource.get(`metric:${point.key}`) ?? (point.monthlyGain === null ? 20 : 40),
      status,
      ...timing,
    }));
  }

  const leverRows = [...new Map([...opportunities.toWatch, ...opportunities.toImplement].map((item) => [item.leverKey, item] as const)).values()];
  for (const item of leverRows) {
    const record = recordsBySource.get(`diagnostic_lever:${item.leverKey}`);
    const initiative = record ? initiativesByInsight.get(record.id) : undefined;
    const timing = actionTiming(record, initiative, today);
    actions.push(makeLeverAction({
      leverKey: item.leverKey,
      label: item.label,
      category: item.category,
      impactAmountEur: item.impactAmountEur,
      impactRangeEur: "impactRangeEur" in item ? item.impactRangeEur : null,
      impactExplanation: item.impactExplanation,
      starterStep: starterByLever.get(item.leverKey) ?? null,
      effort: effort("effort" in item ? item.effort : leverCatalog.find((entry) => entry.leverKey === item.leverKey)?.effort),
      priorityScore: priorityBySource.get(`lever:${item.leverKey}`) ?? (item.impactAmountEur === null ? 18 : 34),
      status: actionState(record, initiative, today),
      ...timing,
    }));
  }

  for (const recommendation of contentRows.filter((row) => row.status === "new" || row.status === "building").slice(0, 4)) {
    const record = recordsBySource.get(`content_recommendation:${recommendation.id}`);
    const initiative = record ? initiativesByInsight.get(record.id) : undefined;
    const timing = actionTiming(record, initiative, today);
    actions.push(makeContentAction({
      recommendationId: recommendation.id,
      title: recommendation.title,
      rationale: recommendation.rationale,
      estImpact: recommendation.estImpact,
      effort: effort(recommendation.effort),
      priorityScore: Math.min(50, 24 + Math.round((recommendation.estImpact ?? 0) / 1000)),
      status: actionState(record, initiative, today),
      ...timing,
    }));
  }

  const reminders = leadRows
    .filter((lead) => lead.reminderDate !== null && !lead.reminderDone && lead.reminderDate <= today)
    .map((lead) => ({
      id: lead.id,
      leadName: `${lead.firstName} ${lead.lastName}`.trim(),
      note: lead.reminderNote,
      reminderDate: lead.reminderDate as string,
      overdueDays: lead.reminderDate && lead.reminderDate < today ? dateDifference(today, lead.reminderDate) : 0,
    }))
    .sort((left, right) => right.overdueDays - left.overdueDays || left.reminderDate.localeCompare(right.reminderDate));
  const clientRemindersForRoadmap: RoadmapClientReminder[] = clientReminderRows.map((reminder) => ({
    id: reminder.id,
    journeyId: reminder.journeyId,
    clientName: reminder.clientName,
    note: reminder.note,
    remindAt: reminder.remindAt.toISOString(),
    overdue: reminder.remindAt.getTime() <= now.getTime(),
  }));
  for (const reminder of reminders) {
    actions.push(makeLeadAction({
      leadId: reminder.id,
      leadName: reminder.leadName,
      note: reminder.note,
      reminderDate: reminder.reminderDate,
      priorityScore: 96,
      overdueDays: reminder.overdueDays,
    }));
  }

  const missingData = !totals.hasAnySourceData || totals.emptyMonths.length > 0;
  if (missingData) {
    const missingMonth = totals.emptyMonths[0];
    const missingMonthLabel = missingMonth ? `${missingMonth.month}/${missingMonth.year}` : "ce mois-ci";
    actions.push(makeCheckinAction({
      monthLabel: missingMonthLabel,
      sourceInsight: `Check-in · données de ${missingMonthLabel.toLowerCase()} manquantes`,
      priorityScore: totals.hasAnySourceData ? 84 : 110,
    }));
  }

  const availableActions = sortJournalActions(actions.filter((action) => action.status !== "done" && action.status !== "dismissed" && action.status !== "snoozed"));
  const todayAction = availableActions[0] ?? null;
  const allNextActions = availableActions.slice(1);
  const nextActions = allNextActions.slice(0, 5);

  const results = initiatives
    .filter((initiative) => initiative.status === "completed" || initiative.status === "awaiting_measurement" || initiative.status === "measured")
    .map((initiative) => {
      const record = records.find((row) => row.id === initiative.insightRecordId);
      return record ? buildResult(record, initiative, measurementsByInitiative.get(initiative.id), today) : null;
    })
    .filter((result): result is JournalResult => result !== null)
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, 8);

  const timeline = buildTimeline(results, rawData.allSettingEntries, rawData.allClosingEntries, now);
  const score = computeScaleScore({
    settingTotals: totals.settingTotals,
    closingTotals: totals.closingTotals,
    benchmarks,
    businessProfile,
    cashContractedTotal: totals.cashContractedTotal,
    activeMetricKeys,
  });
  const scaleScoreDelta30d = score.score === null ? null : await getScaleScoreDelta(accountId, 30, score.score);
  const currentWeekStart = isoDate(mondayOfWeek(now));
  const completedDates = initiatives.flatMap((initiative) => initiative.completedAt ? [isoDate(initiative.completedAt)] : []);
  const momentum: JournalMomentum = {
    actionsDoneThisWeek: completedDates.filter((date) => date >= currentWeekStart).length,
    scaleScoreDelta30d,
    activeWeekStreak: buildActiveWeekStreak(completedDates, now),
  };

  const bottleneckPoint = points[0] ?? null;
  const bottleneck: RoadmapBottleneck | null = bottleneckPoint
    ? {
        key: bottleneckPoint.key,
        label: bottleneckPoint.label,
        category: bottleneckPoint.category,
        currentRatePercent: bottleneckPoint.currentRatePercent,
        benchmarkRatePercent: bottleneckPoint.benchmarkRatePercent,
        monthlyGain: bottleneckPoint.monthlyGain,
        extraClients: bottleneckPoint.extraClients,
        href: `/diagnostic-app?open=${encodeURIComponent(bottleneckPoint.key)}`,
        chatContext: {
          topicType: "metric",
          topicKey: bottleneckPoint.key,
          topicLabel: bottleneckPoint.label,
          sourcePage: "roadmap_bottleneck",
        },
      }
    : null;

  const hasTeamMember =
    setterRows.length > 0 ||
    leadRows.some((lead) => Boolean(lead.setterId || lead.closer?.trim())) ||
    salesTeamRows.length > 0;
  const dailyActions = buildDailyActions(actions, hasTeamMember);
  const staleActivity = chooseStaleRoadmapActivity(today, rawData.allEmailCampaigns, rawData.allContentPosts, contentRows);
  const roadmapItems = buildFocusedRoadmapItems({
    actions,
    bottleneck,
    staleActivity,
    absentLevers: opportunities.toImplement,
    starterByLever,
  });
  const weekRange = currentIsoWeekRange();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentMonthlyRow = rawData.allMonthlyRows.find((row) => row.year === currentYear && row.month === currentMonth);
  const checkInDoneThisWeek =
    rawData.allSettingEntries.some((entry) => inRange(entry.date, weekRange)) ||
    rawData.allClosingEntries.some((entry) => inRange(entry.date, weekRange)) ||
    currentMonthlyRow !== undefined;

  let emptyState: JournalActionLoopData["emptyState"] = null;
  if (!todayAction) {
    emptyState = actions.length > 0 ? "all_done" : "insufficient_data";
  }

  return {
    todayAction,
    nextActions,
    allNextActions,
    moreActionsCount: Math.max(0, allNextActions.length - nextActions.length),
    reminders,
    results,
    timeline,
    momentum,
    emptyState,
    dailyActions,
    bottleneck,
    roadmapItems,
    roadmapVisible: roadmapItems.length >= 2,
    clientReminders: clientRemindersForRoadmap,
    checkInDoneThisWeek,
  };
}

export async function measureDueJournalActions(accountId: string, actorUserId: string): Promise<void> {
  const cutoff = new Date(Date.now() - MIN_RESULT_AGE_DAYS * 86_400_000);
  const rows = await db
    .select()
    .from(improvementInitiatives)
    .where(and(eq(improvementInitiatives.userId, accountId), inArray(improvementInitiatives.status, ["completed", "awaiting_measurement"])))
    .limit(20);

  for (const initiative of rows) {
    if (!initiative.completedAt || initiative.completedAt > cutoff || !initiative.baseline?.metricKey) continue;
    const readiness = await calculateComparableMeasurement(accountId, initiative.baseline, new Date());
    if (!readiness.ready) {
      if (initiative.status !== "awaiting_measurement") {
        await db.update(improvementInitiatives).set({ status: "awaiting_measurement", lastActivityAt: new Date(), updatedAt: new Date() }).where(and(eq(improvementInitiatives.id, initiative.id), eq(improvementInitiatives.userId, accountId)));
      }
      continue;
    }

    const [latest] = await db.select({ version: initiativeMeasurements.version }).from(initiativeMeasurements).where(and(eq(initiativeMeasurements.initiativeId, initiative.id), eq(initiativeMeasurements.userId, accountId))).orderBy(desc(initiativeMeasurements.version)).limit(1);
    const snapshot = readiness.snapshot;
    const now = new Date();
    const version = (latest?.version ?? 0) + 1;
    const [inserted] = await db.insert(initiativeMeasurements).values({
      userId: accountId,
      initiativeId: initiative.id,
      version,
      evidence: snapshot.evidence,
      metricKey: snapshot.metricKey,
      unit: snapshot.unit,
      beforeValue: snapshot.beforeValue,
      afterValue: snapshot.afterValue,
      deltaValue: snapshot.deltaValue,
      beforePeriodStart: snapshot.beforePeriodStart,
      beforePeriodEnd: snapshot.beforePeriodEnd,
      afterPeriodStart: snapshot.afterPeriodStart,
      afterPeriodEnd: snapshot.afterPeriodEnd,
      sampleSize: snapshot.sampleSize,
      cashImpactEur: snapshot.cashImpactEur,
      cashCurrency: snapshot.cashCurrency,
      source: snapshot.source,
      note: snapshot.note,
      measuredAt: now,
    }).onConflictDoNothing({ target: [initiativeMeasurements.initiativeId, initiativeMeasurements.version] }).returning({ id: initiativeMeasurements.id });
    if (!inserted) continue;

    await db.update(improvementInitiatives).set({ status: "measured", measuredAt: now, lastActivityAt: now, updatedAt: now }).where(and(eq(improvementInitiatives.id, initiative.id), eq(improvementInitiatives.userId, accountId)));
    await db.update(insightRecords).set({ decision: "completed", updatedAt: now }).where(and(eq(insightRecords.id, initiative.insightRecordId), eq(insightRecords.userId, accountId)));
    await recordInitiativeMeasured(accountId, initiative.id, initiative.title);
    if (snapshot.deltaValue !== null && snapshot.deltaValue > 0) {
      await track("action_result_positive", actorUserId, { metric_key: snapshot.metricKey, delta: snapshot.deltaValue });
    }
  }
}
