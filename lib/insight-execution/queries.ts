import { and, desc, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  funnelStageInsights,
  improvementInitiatives,
  initiativeMeasurements,
  initiativeWeeklyFocus,
  insightRecords,
  teamMemberRoles,
  teamMembers,
  teamRoles,
} from "@/db/schema";

import { insightHistoryFilterSchema } from "./schemas";
import type {
  BaselineSnapshot,
  ExecutionProgress,
  InsightHistoryItem,
  InitiativeSummary,
  MeasurementSnapshot,
} from "./types";
import { canAccessAssignedInitiative } from "./state";
import { currentWeekStart, previousWeekStart } from "./week";

type InitiativeRow = typeof improvementInitiatives.$inferSelect;
type MeasurementRow = typeof initiativeMeasurements.$inferSelect;

function dateFromTimestamp(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function isBetween(value: Date | null, from: string, to: string): boolean {
  if (!value) return false;
  const date = dateFromTimestamp(value);
  return date >= from && date <= to;
}

function weekEnd(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

function measurementDto(
  row: MeasurementRow | undefined,
): MeasurementSnapshot | null {
  if (!row) return null;
  return {
    version: row.version,
    measuredAt: row.measuredAt.toISOString(),
    metricKey: row.metricKey,
    unit: row.unit,
    evidence: row.evidence,
    beforeValue: row.beforeValue,
    afterValue: row.afterValue,
    deltaValue: row.deltaValue,
    beforePeriodStart: row.beforePeriodStart,
    beforePeriodEnd: row.beforePeriodEnd,
    afterPeriodStart: row.afterPeriodStart,
    afterPeriodEnd: row.afterPeriodEnd,
    sampleSize: row.sampleSize,
    cashImpactEur: row.cashImpactEur,
    cashCurrency: row.cashCurrency,
    source: row.source,
    note: row.note,
  };
}

async function loadInitiativeData(accountId: string) {
  const [initiatives, measurements, focusRows, members, roles] =
    await Promise.all([
      db
        .select()
        .from(improvementInitiatives)
        .where(eq(improvementInitiatives.userId, accountId))
        .orderBy(desc(improvementInitiatives.createdAt)),
      db
        .select()
        .from(initiativeMeasurements)
        .where(eq(initiativeMeasurements.userId, accountId))
        .orderBy(desc(initiativeMeasurements.version)),
      db
        .select()
        .from(initiativeWeeklyFocus)
        .where(eq(initiativeWeeklyFocus.userId, accountId)),
      db
        .select()
        .from(teamMembers)
        .where(
          and(
            eq(teamMembers.accountId, accountId),
            eq(teamMembers.status, "active"),
          ),
        ),
      db
        .select({
          teamMemberId: teamMemberRoles.teamMemberId,
          roleName: teamRoles.name,
        })
        .from(teamMemberRoles)
        .innerJoin(teamRoles, eq(teamMemberRoles.roleId, teamRoles.id))
        .where(eq(teamRoles.accountId, accountId)),
    ]);

  const memberMap = new Map(
    members.map((member) => [
      member.id,
      {
        id: member.id,
        memberUserId: member.memberUserId,
        name: member.email.split("@")[0] || member.email,
        roles: roles
          .filter((role) => role.teamMemberId === member.id)
          .map((role) => role.roleName),
      },
    ]),
  );
  const latestMeasurementByInitiative = new Map<string, MeasurementRow>();
  for (const measurement of measurements) {
    if (!latestMeasurementByInitiative.has(measurement.initiativeId)) {
      latestMeasurementByInitiative.set(measurement.initiativeId, measurement);
    }
  }
  const focusByWeek = new Map(
    focusRows.map((focus) => [focus.weekStart, focus]),
  );

  return { initiatives, latestMeasurementByInitiative, memberMap, focusByWeek };
}

function toInitiativeSummary(
  row: InitiativeRow,
  data: Awaited<ReturnType<typeof loadInitiativeData>>,
  weekStart = currentWeekStart(),
): InitiativeSummary {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    dueDate: row.dueDate,
    todoId: row.todoId,
    projectId: row.projectId,
    assignedMember: row.assignedTeamMemberId
      ? (() => {
          const member = data.memberMap.get(row.assignedTeamMemberId);
          return member
            ? { id: member.id, name: member.name, roles: member.roles }
            : null;
        })()
      : null,
    isWeeklyFocus: data.focusByWeek.get(weekStart)?.initiativeId === row.id,
    baseline: row.baseline,
    latestMeasurement: measurementDto(
      data.latestMeasurementByInitiative.get(row.id),
    ),
    snoozedUntil: row.snoozedUntil,
  };
}

export async function getInitiativeSummaries(
  accountId: string,
  weekStart = currentWeekStart(),
): Promise<InitiativeSummary[]> {
  const data = await loadInitiativeData(accountId);
  return data.initiatives.map((row) =>
    toInitiativeSummary(row, data, weekStart),
  );
}

export async function getWeeklyFocus(
  accountId: string,
  weekStart = currentWeekStart(),
): Promise<InitiativeSummary | null> {
  const data = await loadInitiativeData(accountId);
  const focus = data.focusByWeek.get(weekStart);
  if (!focus) return null;
  const initiative = data.initiatives.find(
    (row) => row.id === focus.initiativeId && row.status !== "cancelled",
  );
  return initiative ? toInitiativeSummary(initiative, data, weekStart) : null;
}

export async function getExecutionProgress(
  accountId: string,
  viewerUserId?: string,
): Promise<ExecutionProgress> {
  const weekStart = currentWeekStart();
  const data = await loadInitiativeData(accountId);
  let initiatives = data.initiatives;

  if (viewerUserId && viewerUserId !== accountId) {
    const member = [...data.memberMap.values()].find(
      (candidate) => candidate.memberUserId === viewerUserId,
    );
    initiatives = member
      ? initiatives.filter(
          (initiative) => initiative.assignedTeamMemberId === member.id,
        )
      : [];
  }

  const focusRow = data.focusByWeek.get(weekStart);
  const focusInitiative = initiatives.find(
    (initiative) =>
      initiative.id === focusRow?.initiativeId &&
      initiative.status !== "cancelled",
  );
  const countForWeek = (week: string) => {
    const end = weekEnd(week);
    return {
      weekStart: week,
      launched: initiatives.filter((initiative) =>
        isBetween(initiative.createdAt, week, end),
      ).length,
      completed: initiatives.filter((initiative) =>
        isBetween(initiative.completedAt, week, end),
      ).length,
      measured: initiatives.filter((initiative) =>
        isBetween(initiative.measuredAt, week, end),
      ).length,
    };
  };

  const weeks: {
    weekStart: string;
    launched: number;
    completed: number;
    measured: number;
  }[] = [];
  let cursor = previousWeekStart(weekStart);
  for (let index = 0; index < 4; index += 1) {
    weeks.push(countForWeek(cursor));
    cursor = previousWeekStart(cursor);
  }

  const focus = focusInitiative
    ? toInitiativeSummary(focusInitiative, data, weekStart)
    : null;
  const current = countForWeek(weekStart);
  const firstEver = (field: "createdAt" | "completedAt" | "measuredAt") =>
    initiatives
      .filter((initiative) => initiative[field] !== null)
      .sort(
        (left, right) =>
          (left[field]?.getTime() ?? 0) - (right[field]?.getTime() ?? 0),
      )[0];
  const milestoneInWeek = (
    field: "createdAt" | "completedAt" | "measuredAt",
  ) => {
    const first = firstEver(field);
    return first && isBetween(first[field], weekStart, weekEnd(weekStart));
  };
  const milestone = milestoneInWeek("measuredAt")
    ? "measured"
    : milestoneInWeek("completedAt")
      ? "completed"
      : milestoneInWeek("createdAt")
        ? "launched"
        : null;
  return {
    weekStart,
    focus,
    launchedThisWeek: current.launched,
    completedThisWeek: current.completed,
    measuredThisWeek: current.measured,
    previousWeeks: weeks,
    milestone,
  };
}

export async function getAssignableMembers(accountId: string) {
  const data = await loadInitiativeData(accountId);
  return [...data.memberMap.values()].map(({ id, name, roles }) => ({
    id,
    name,
    roles,
  }));
}

export async function getInsightHistory(
  accountId: string,
  rawFilter: unknown = {},
  viewerUserId?: string,
): Promise<InsightHistoryItem[]> {
  const parsedFilter = insightHistoryFilterSchema.safeParse(rawFilter);
  const filter = parsedFilter.success ? parsedFilter.data : {};
  const conditions = [eq(insightRecords.userId, accountId)];
  if (filter.decision)
    conditions.push(eq(insightRecords.decision, filter.decision));
  if (filter.sourceType)
    conditions.push(eq(insightRecords.sourceType, filter.sourceType));
  if (filter.from)
    conditions.push(
      gte(insightRecords.createdAt, new Date(`${filter.from}T00:00:00Z`)),
    );
  if (filter.to)
    conditions.push(
      lte(insightRecords.createdAt, new Date(`${filter.to}T23:59:59.999Z`)),
    );

  const [records, legacyRows, data] = await Promise.all([
    db
      .select()
      .from(insightRecords)
      .where(and(...conditions))
      .orderBy(desc(insightRecords.createdAt))
      .limit(50),
    filter.sourceType && filter.sourceType !== "funnel_stage"
      ? Promise.resolve([])
      : db
          .select()
          .from(funnelStageInsights)
          .where(eq(funnelStageInsights.userId, accountId))
          .orderBy(desc(funnelStageInsights.generatedAt))
          .limit(50),
    loadInitiativeData(accountId),
  ]);

  const normalizedKeys = new Set(
    records.map((record) => `${record.sourceType}:${record.sourceId}`),
  );
  const initiativesByInsight = new Map(
    data.initiatives.map((initiative) => [
      initiative.insightRecordId,
      initiative,
    ]),
  );
  const viewerMemberId =
    viewerUserId && viewerUserId !== accountId
      ? ([...data.memberMap.values()].find(
          (member) => member.memberUserId === viewerUserId,
        )?.id ?? null)
      : undefined;
  const visibleRecords = records.filter((record) => {
    if (viewerMemberId === undefined) return true;
    const initiative = initiativesByInsight.get(record.id);
    return (
      !initiative ||
      canAccessAssignedInitiative(
        false,
        initiative.assignedTeamMemberId,
        viewerMemberId,
      )
    );
  });
  const currentWeek = currentWeekStart();
  const items: InsightHistoryItem[] = visibleRecords.map((record) => ({
    id: record.id,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    title: record.title,
    insightText: record.insightText,
    sourceLabel: record.sourceLabel,
    decision: record.decision,
    generatedAt: record.createdAt.toISOString(),
    resumeAt: record.resumeAt,
    periodStart: record.periodStart,
    periodEnd: record.periodEnd,
    snapshot: record.snapshot,
    impactProjection: record.impactProjection,
    initiative: (() => {
      const initiative = initiativesByInsight.get(record.id);
      return initiative
        ? toInitiativeSummary(initiative, data, currentWeek)
        : null;
    })(),
    legacy: false,
  }));

  for (const row of legacyRows) {
    if (normalizedKeys.has(`funnel_stage:${row.id}`)) continue;
    const decision =
      row.implemented === true
        ? "completed"
        : row.implemented === false
          ? "dismissed"
          : "todo";
    if (filter.decision && filter.decision !== decision) continue;
    const generatedAt = row.generatedAt.toISOString();
    const date = generatedAt.slice(0, 10);
    if (filter.from && date < filter.from) continue;
    if (filter.to && date > filter.to) continue;
    items.push({
      id: row.id,
      sourceType: "funnel_stage",
      sourceId: row.id,
      title: `Insight · ${row.stage}`,
      insightText: row.insightText,
      sourceLabel: "Funnel",
      decision,
      generatedAt,
      resumeAt: null,
      periodStart: date,
      periodEnd: date,
      snapshot: { stage: row.stage, answers: row.answers },
      impactProjection: null,
      initiative: null,
      legacy: true,
    });
  }

  return items
    .sort((left, right) => right.generatedAt.localeCompare(left.generatedAt))
    .slice(0, 50);
}

export async function getInitiativeById(
  accountId: string,
  initiativeId: string,
) {
  const [row] = await db
    .select()
    .from(improvementInitiatives)
    .where(
      and(
        eq(improvementInitiatives.id, initiativeId),
        eq(improvementInitiatives.userId, accountId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getInsightRecordById(
  accountId: string,
  insightId: string,
) {
  const [row] = await db
    .select()
    .from(insightRecords)
    .where(
      and(
        eq(insightRecords.id, insightId),
        eq(insightRecords.userId, accountId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function getLatestMeasurement(
  accountId: string,
  initiativeId: string,
) {
  const [row] = await db
    .select()
    .from(initiativeMeasurements)
    .where(
      and(
        eq(initiativeMeasurements.userId, accountId),
        eq(initiativeMeasurements.initiativeId, initiativeId),
      ),
    )
    .orderBy(desc(initiativeMeasurements.version))
    .limit(1);
  return row ?? null;
}

export function toPublicInitiativeSummary(
  accountId: string,
  initiative: InitiativeRow,
  data: Awaited<ReturnType<typeof loadInitiativeData>>,
): InitiativeSummary {
  void accountId;
  return toInitiativeSummary(initiative, data);
}

export type { BaselineSnapshot };
