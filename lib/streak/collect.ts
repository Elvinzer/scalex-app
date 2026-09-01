import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  activityLog,
  closingKpiEntries,
  contentPosts,
  emailCampaigns,
  improvementEvents,
  leadComments,
  leadStageHistory,
  leads,
  settingKpiEntries,
} from "@/db/schema";

import type { ActivityDay } from "./rules";
import type { ActivitySource } from "./sources";
import { ACTIVITY_SOURCE_ORDER } from "./sources";

// Reads the six tables that already record the coach's work and returns one
// entry per active day. Nothing is written by the user for the streak's sake
// (§A: "la détection est AUTOMATIQUE quand la donnée existe déjà"), and
// nothing here is stored on its own — ./service.ts caches the result into
// activity_log so the sidebar doesn't run six queries per render.
//
// Two different notions of "date" appear below, on purpose:
//   • Published/sent dates (content, email) are the day the thing went out.
//     A video published on the 3rd made the 3rd an active day, even if the
//     YouTube sync only imported it on the 9th — the work happened then.
//   • created_at (check-in, pipeline) is the day the user performed the
//     gesture. A KPI row DESCRIBING last Tuesday but entered today validates
//     today, not last Tuesday; crediting the described day would let one
//     Monday of back-filling light up a whole week.

export async function collectActivityDays(userId: string, fromDate: string): Promise<ActivityDay[]> {
  const [posts, emails, improvements, settingRows, closingRows, comments, stageChanges] = await Promise.all([
    db
      .select({ date: contentPosts.publishedAt })
      .from(contentPosts)
      .where(and(eq(contentPosts.userId, userId), gte(contentPosts.publishedAt, fromDate))),

    db
      .select({ date: emailCampaigns.sentAt })
      .from(emailCampaigns)
      .where(and(eq(emailCampaigns.userId, userId), gte(emailCampaigns.sentAt, fromDate))),

    db
      .select({ date: improvementEvents.date })
      .from(improvementEvents)
      .where(and(eq(improvementEvents.userId, userId), gte(improvementEvents.date, fromDate))),

    db
      .select({ date: sql<string>`(${settingKpiEntries.createdAt} at time zone 'utc')::date::text` })
      .from(settingKpiEntries)
      .where(and(eq(settingKpiEntries.userId, userId), gte(sql`(${settingKpiEntries.createdAt} at time zone 'utc')::date`, fromDate))),

    db
      .select({ date: sql<string>`(${closingKpiEntries.createdAt} at time zone 'utc')::date::text` })
      .from(closingKpiEntries)
      .where(and(eq(closingKpiEntries.userId, userId), gte(sql`(${closingKpiEntries.createdAt} at time zone 'utc')::date`, fromDate))),

    db
      .select({ date: sql<string>`(${leadComments.createdAt} at time zone 'utc')::date::text` })
      .from(leadComments)
      .where(and(eq(leadComments.userId, userId), gte(sql`(${leadComments.createdAt} at time zone 'utc')::date`, fromDate))),

    // lead_stage_history carries no user_id of its own — scoped through the
    // lead it belongs to rather than trusting the row in isolation.
    db
      .select({ date: sql<string>`(${leadStageHistory.changedAt} at time zone 'utc')::date::text` })
      .from(leadStageHistory)
      .innerJoin(leads, eq(leadStageHistory.leadId, leads.id))
      .where(and(eq(leads.accountId, userId), gte(sql`(${leadStageHistory.changedAt} at time zone 'utc')::date`, fromDate))),
  ]);

  const byDate = new Map<string, Set<ActivitySource>>();
  const add = (date: string | null, source: ActivitySource) => {
    if (!date) return;
    const existing = byDate.get(date) ?? new Set<ActivitySource>();
    existing.add(source);
    byDate.set(date, existing);
  };

  for (const row of posts) add(row.date, "content_published");
  for (const row of emails) add(row.date, "email_sent");
  for (const row of improvements) add(row.date, "business_progress");
  for (const row of settingRows) add(row.date, "checkin_filled");
  for (const row of closingRows) add(row.date, "checkin_filled");
  for (const row of comments) add(row.date, "lead_worked");
  for (const row of stageChanges) add(row.date, "lead_worked");

  return Array.from(byDate.entries())
    .map(([date, sources]) => ({
      date,
      sources: ACTIVITY_SOURCE_ORDER.filter((source) => sources.has(source)),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

// Replaces the cached window wholesale rather than diffing: the source tables
// are the authority, so a deleted post or a corrected entry has to be able to
// REMOVE an active day, not just add one.
//
// Serialized per user by an advisory lock. Next renders the layout (sidebar
// flame) and the page concurrently, and the daily cron can land at the same
// moment, so two refreshes for one account genuinely overlap. Under READ
// COMMITTED both transactions delete, then both insert, and the second one
// hits activity_log's (user_id, date) primary key — a 500 on the Journal, in
// production, from two writes that were computing the exact same rows. The
// lock is transaction-scoped, so it releases on commit or rollback with no
// cleanup path to get wrong.
export async function replaceActivityWindow(userId: string, fromDate: string, days: ActivityDay[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`streak:${userId}`}))`);

    await tx.delete(activityLog).where(and(eq(activityLog.userId, userId), gte(activityLog.date, fromDate)));
    if (days.length === 0) return;

    // Upsert rather than plain insert: the lock covers concurrent refreshes,
    // this covers everything else (a retried step, a row outside the deleted
    // window). Both writers derive the same values, so last-write-wins is
    // always the right outcome here.
    await tx
      .insert(activityLog)
      .values(days.map((day) => ({ userId, date: day.date, sources: day.sources })))
      .onConflictDoUpdate({
        target: [activityLog.userId, activityLog.date],
        set: { sources: sql`excluded.sources` },
      });
  });
}

export async function readActivityLog(userId: string, fromDate: string): Promise<ActivityDay[]> {
  const rows = await db
    .select({ date: activityLog.date, sources: activityLog.sources })
    .from(activityLog)
    .where(and(eq(activityLog.userId, userId), gte(activityLog.date, fromDate)))
    .orderBy(activityLog.date);
  return rows.map((row) => ({ date: row.date, sources: row.sources as ActivitySource[] }));
}
