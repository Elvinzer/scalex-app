export const INSIGHT_SOURCE_TYPES = [
  "diagnostic_metric",
  "diagnostic_lever",
  "funnel_stage",
  "content_recommendation",
  "copilote",
] as const;

export type InsightSourceType = (typeof INSIGHT_SOURCE_TYPES)[number];

export const INSIGHT_DECISIONS = [
  "todo",
  "launched",
  "later",
  "dismissed",
  "completed",
] as const;

export type InsightDecision = (typeof INSIGHT_DECISIONS)[number];

export const INITIATIVE_STATUSES = [
  "planned",
  "in_progress",
  "paused",
  "completed",
  "awaiting_measurement",
  "measured",
  "cancelled",
] as const;

export type InitiativeStatus = (typeof INITIATIVE_STATUSES)[number];

export const MEASUREMENT_EVIDENCE_TYPES = [
  "observed",
  "estimated",
  "not_calculable",
  "qualitative",
] as const;

export type MeasurementEvidenceType =
  (typeof MEASUREMENT_EVIDENCE_TYPES)[number];

export const BASELINE_UNITS = ["fraction", "percent", "eur", "count"] as const;

export type BaselineUnit = (typeof BASELINE_UNITS)[number];

export type InsightSnapshot = Record<string, unknown>;

export type CopiloteInsightSnapshot = {
  kind: "copilote";
  version: 1;
  problem: string;
  actionText: string;
  successCriterion: string;
};

export type InsightImpactProjection = {
  amountEur: number | null;
  rangeEur?: { min: number; max: number } | null;
  label?: string;
};

export type BaselineSnapshot = {
  metricKey: string;
  unit: BaselineUnit;
  value: number;
  periodStart: string;
  periodEnd: string;
  sampleSize: number;
  source: string;
  freshness: string;
  benchmarkValue?: number | null;
  cashValueEur?: number | null;
};

export type MeasurementSnapshot = {
  version?: number;
  measuredAt?: string;
  metricKey: string | null;
  unit: BaselineUnit | null;
  evidence: MeasurementEvidenceType;
  beforeValue: number | null;
  afterValue: number | null;
  deltaValue: number | null;
  beforePeriodStart: string | null;
  beforePeriodEnd: string | null;
  afterPeriodStart: string | null;
  afterPeriodEnd: string | null;
  sampleSize: number | null;
  cashImpactEur: number | null;
  cashCurrency: string | null;
  source: string | null;
  note: string | null;
};

export type InsightHistoryItem = {
  id: string;
  sourceType: InsightSourceType;
  sourceId: string;
  title: string;
  insightText: string;
  sourceLabel: string | null;
  decision: InsightDecision;
  generatedAt: string;
  resumeAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  snapshot: InsightSnapshot;
  impactProjection: InsightImpactProjection | null;
  initiative: InitiativeSummary | null;
  legacy: boolean;
};

export type ConversationInsightSummary = {
  id: string;
  decision: InsightDecision;
};

export type InitiativeSummary = {
  id: string;
  title: string;
  status: InitiativeStatus;
  dueDate: string | null;
  todoId: string | null;
  projectId: string | null;
  assignedMember: { id: string; name: string; roles: string[] } | null;
  isWeeklyFocus: boolean;
  baseline: BaselineSnapshot | null;
  latestMeasurement: MeasurementSnapshot | null;
  snoozedUntil: string | null;
};

export type ExecutionProgress = {
  weekStart: string;
  focus: InitiativeSummary | null;
  launchedThisWeek: number;
  completedThisWeek: number;
  measuredThisWeek: number;
  previousWeeks: {
    weekStart: string;
    launched: number;
    completed: number;
    measured: number;
  }[];
  milestone: "launched" | "completed" | "measured" | null;
};

export type FollowUpNudge = {
  initiativeId: string;
  title: string;
  status: InitiativeStatus;
  reason: string;
  dueDate: string | null;
  weekStart: string;
};
