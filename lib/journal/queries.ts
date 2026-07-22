import { and, eq, gte, lte } from "drizzle-orm";

import { db } from "@/db";
import { closingKpiEntries, improvementEvents, journalNotes, projects, settingKpiEntries, todos } from "@/db/schema";
import { monthDateRange } from "@/lib/date-range";

import { computeRoughDayScore, EMPTY_DAY_TOTALS, type DayEntryTotals } from "./day-health";

export type ImprovementEvent = {
  id: string;
  type: string;
  label: string;
  sourceId: string | null;
  createdAt: Date;
};

export type JournalDay = {
  date: string; // ISO
  totals: DayEntryTotals;
  hasActivity: boolean;
  score: number | null;
  events: ImprovementEvent[];
  note: string;
};

// One query per source table for the whole visible month — the calendar
// never fetches per-day, everything a cell/drawer needs is already in this
// map by the time it renders. Read-only: this is exactly the "lecture des
// tables du suivi quotidien existant, aucune duplication" rule from the
// brief.
export async function getJournalMonth(accountId: string, year: number, month: number): Promise<Map<string, JournalDay>> {
  const range = monthDateRange(year, month);

  const [settingRows, closingRows, eventRows, noteRows] = await Promise.all([
    db
      .select()
      .from(settingKpiEntries)
      .where(and(eq(settingKpiEntries.userId, accountId), gte(settingKpiEntries.date, range.from), lte(settingKpiEntries.date, range.to))),
    db
      .select()
      .from(closingKpiEntries)
      .where(and(eq(closingKpiEntries.userId, accountId), gte(closingKpiEntries.date, range.from), lte(closingKpiEntries.date, range.to))),
    db
      .select()
      .from(improvementEvents)
      .where(and(eq(improvementEvents.userId, accountId), gte(improvementEvents.date, range.from), lte(improvementEvents.date, range.to))),
    db
      .select()
      .from(journalNotes)
      .where(and(eq(journalNotes.userId, accountId), gte(journalNotes.date, range.from), lte(journalNotes.date, range.to))),
  ]);

  const days = new Map<string, JournalDay>();

  function dayFor(date: string): JournalDay {
    let day = days.get(date);
    if (!day) {
      day = { date, totals: { ...EMPTY_DAY_TOTALS }, hasActivity: false, score: null, events: [], note: "" };
      days.set(date, day);
    }
    return day;
  }

  for (const row of settingRows) {
    const day = dayFor(row.date);
    day.totals.newSubscribers += row.newSubscribers;
    day.totals.firstMessagesSent += row.firstMessagesSent;
    day.totals.conversationsStarted += row.conversationsStarted;
    day.totals.callsProposed += row.callsProposed;
    day.totals.callsBooked += row.callsBooked;
    day.hasActivity = true;
  }
  for (const row of closingRows) {
    const day = dayFor(row.date);
    day.totals.callsAttended += row.callsAttended;
    day.totals.salesClosed += row.salesClosed;
    day.hasActivity = true;
  }
  for (const row of eventRows) {
    dayFor(row.date).events.push({ id: row.id, type: row.type, label: row.label, sourceId: row.sourceId, createdAt: row.createdAt });
  }
  for (const row of noteRows) {
    dayFor(row.date).note = row.content;
  }

  for (const day of days.values()) {
    day.score = computeRoughDayScore(day.totals);
  }

  return days;
}

export async function getJournalTodos(accountId: string) {
  return db.select().from(todos).where(eq(todos.userId, accountId)).orderBy(todos.createdAt);
}

export async function getJournalProjects(accountId: string) {
  return db.select().from(projects).where(eq(projects.userId, accountId)).orderBy(projects.createdAt);
}
