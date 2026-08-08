import { and, asc, eq, inArray, isNull, lte, lt, or } from "drizzle-orm";

import { db } from "@/db";
import {
  improvementInitiatives,
  initiativeNudges,
  teamMembers,
} from "@/db/schema";

import type { FollowUpNudge } from "./types";
import { addDays, currentWeekStart } from "./week";

const FOLLOW_UP_STATUSES = [
  "planned",
  "in_progress",
  "awaiting_measurement",
] as const;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function followUpReason(dueDate: string | null, lastActivityAt: Date): string {
  const todayIso = today();
  if (dueDate && dueDate < todayIso)
    return "Cette action a dépassé son échéance.";
  if (dueDate && dueDate <= addDays(todayIso, 7))
    return "Son échéance approche cette semaine.";
  return `Aucune activité depuis le ${lastActivityAt.toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" })}.`;
}

function isSnoozed(snoozedUntil: string | null): boolean {
  return snoozedUntil !== null && snoozedUntil >= today();
}

async function assignedMemberId(
  accountId: string,
  viewerUserId?: string,
): Promise<string | null | undefined> {
  if (!viewerUserId || viewerUserId === accountId) return undefined;
  const [member] = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(
      and(
        eq(teamMembers.accountId, accountId),
        eq(teamMembers.memberUserId, viewerUserId),
        eq(teamMembers.status, "active"),
      ),
    )
    .limit(1);
  return member?.id ?? null;
}

export async function getFollowUpCandidate(
  accountId: string,
  viewerUserId?: string,
): Promise<FollowUpNudge | null> {
  const todayIso = today();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const memberId = await assignedMemberId(accountId, viewerUserId);
  if (memberId === null) return null;
  const initiatives = await db
    .select({
      id: improvementInitiatives.id,
      title: improvementInitiatives.title,
      status: improvementInitiatives.status,
      dueDate: improvementInitiatives.dueDate,
      lastActivityAt: improvementInitiatives.lastActivityAt,
      snoozedUntil: improvementInitiatives.snoozedUntil,
    })
    .from(improvementInitiatives)
    .where(
      and(
        eq(improvementInitiatives.userId, accountId),
        inArray(improvementInitiatives.status, FOLLOW_UP_STATUSES),
        ...(memberId
          ? [eq(improvementInitiatives.assignedTeamMemberId, memberId)]
          : []),
        or(
          lte(improvementInitiatives.dueDate, addDays(todayIso, 7)),
          lt(improvementInitiatives.lastActivityAt, sevenDaysAgo),
        ),
      ),
    )
    .orderBy(
      asc(improvementInitiatives.dueDate),
      asc(improvementInitiatives.lastActivityAt),
    )
    .limit(10);

  const initiative = initiatives.find(
    (candidate) => !isSnoozed(candidate.snoozedUntil),
  );
  if (!initiative) return null;
  return {
    initiativeId: initiative.id,
    title: initiative.title,
    status: initiative.status,
    reason: followUpReason(initiative.dueDate, initiative.lastActivityAt),
    dueDate: initiative.dueDate,
    weekStart: currentWeekStart(),
  };
}

export async function ensureWeeklyNudges(accountId: string): Promise<number> {
  const todayIso = today();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const candidates = await db
    .select({
      id: improvementInitiatives.id,
      title: improvementInitiatives.title,
      dueDate: improvementInitiatives.dueDate,
      lastActivityAt: improvementInitiatives.lastActivityAt,
      snoozedUntil: improvementInitiatives.snoozedUntil,
    })
    .from(improvementInitiatives)
    .where(
      and(
        eq(improvementInitiatives.userId, accountId),
        inArray(improvementInitiatives.status, FOLLOW_UP_STATUSES),
        or(
          lte(improvementInitiatives.dueDate, addDays(todayIso, 7)),
          lt(improvementInitiatives.lastActivityAt, sevenDaysAgo),
        ),
      ),
    )
    .orderBy(
      asc(improvementInitiatives.dueDate),
      asc(improvementInitiatives.lastActivityAt),
    )
    .limit(10);

  let created = 0;
  for (const candidate of candidates) {
    if (isSnoozed(candidate.snoozedUntil)) continue;
    const [row] = await db
      .insert(initiativeNudges)
      .values({
        userId: accountId,
        initiativeId: candidate.id,
        weekStart: currentWeekStart(),
        reason: followUpReason(candidate.dueDate, candidate.lastActivityAt),
      })
      .onConflictDoNothing({
        target: [initiativeNudges.initiativeId, initiativeNudges.weekStart],
      })
      .returning({ id: initiativeNudges.id });
    if (row) created += 1;
  }
  return created;
}

export async function getActiveNudge(
  accountId: string,
  viewerUserId?: string,
): Promise<FollowUpNudge | null> {
  const memberId = await assignedMemberId(accountId, viewerUserId);
  if (memberId === null) return null;
  const [row] = await db
    .select({
      initiativeId: initiativeNudges.initiativeId,
      title: improvementInitiatives.title,
      status: improvementInitiatives.status,
      reason: initiativeNudges.reason,
      dueDate: improvementInitiatives.dueDate,
      weekStart: initiativeNudges.weekStart,
    })
    .from(initiativeNudges)
    .innerJoin(
      improvementInitiatives,
      eq(initiativeNudges.initiativeId, improvementInitiatives.id),
    )
    .where(
      and(
        eq(initiativeNudges.userId, accountId),
        eq(improvementInitiatives.userId, accountId),
        eq(initiativeNudges.weekStart, currentWeekStart()),
        isNull(initiativeNudges.dismissedAt),
        inArray(improvementInitiatives.status, FOLLOW_UP_STATUSES),
        or(
          isNull(improvementInitiatives.snoozedUntil),
          lt(improvementInitiatives.snoozedUntil, today()),
        ),
        ...(memberId
          ? [eq(improvementInitiatives.assignedTeamMemberId, memberId)]
          : []),
      ),
    )
    .orderBy(asc(improvementInitiatives.dueDate))
    .limit(1);
  return row ?? null;
}
