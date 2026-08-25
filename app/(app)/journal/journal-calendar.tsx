"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { cn } from "@/lib/utils";

import { DayDrawer } from "./day-drawer";
import type { JournalDay } from "@/lib/journal/queries";

const WEEKDAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Monday-first weekday index (0 = Monday .. 6 = Sunday) for JS's own
// Sunday-first getDay().
function mondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

type CalendarCell = { date: string; day: number; isFuture: boolean; isToday: boolean };

export type JournalCalendarEvent = {
  id: string;
  date: string;
  label: string;
  type: string;
  completed?: boolean;
};

function buildGrid(year: number, month: number, todayIso: string): CalendarCell[] {
  const firstOfMonth = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leadingBlanks = mondayIndex(firstOfMonth.getUTCDay());

  const cells: CalendarCell[] = [];
  for (let i = 0; i < leadingBlanks; i++) {
    cells.push({ date: "", day: 0, isFuture: false, isToday: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    cells.push({ date, day, isFuture: date > todayIso, isToday: date === todayIso });
  }
  return cells;
}

export function JournalCalendar({
  year,
  month,
  days,
  todayIso,
  basePath = "/journal",
  additionalEvents = [],
}: {
  year: number;
  month: number;
  days: JournalDay[];
  todayIso: string;
  basePath?: string;
  additionalEvents?: JournalCalendarEvent[];
}) {
  const locale = useLocale();
  const t = useTranslations("journal.calendar");
  const router = useRouter();
  const [selected, setSelected] = useState<JournalDay | null>(null);
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const eventsByDate = new Map<string, JournalCalendarEvent[]>();
  for (const event of additionalEvents) {
    const events = eventsByDate.get(event.date) ?? [];
    events.push(event);
    eventsByDate.set(event.date, events);
  }
  const cells = buildGrid(year, month, todayIso);

  function goToMonth(nextYear: number, nextMonth: number) {
    router.push(`${basePath}?year=${nextYear}&month=${nextMonth}`);
  }

  function handlePrev() {
    if (month === 1) goToMonth(year - 1, 12);
    else goToMonth(year, month - 1);
  }
  function handleNext() {
    if (month === 12) goToMonth(year + 1, 1);
    else goToMonth(year, month + 1);
  }
  function handleToday() {
    const now = new Date();
    goToMonth(now.getUTCFullYear(), now.getUTCMonth() + 1);
  }

  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, { month: "long", timeZone: "UTC" });

  return (
    <div className="sticker-card p-4 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-bold">
          {monthLabel} {year}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={handlePrev} aria-label={t("previousMonth")}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToday}>
            {t("today")}
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleNext} aria-label={t("nextMonth")}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_KEYS.map((key) => (
          <div key={key} className="pb-1 text-center text-[11px] font-bold text-muted-foreground">
            {t(`weekdays.${key}`)}
          </div>
        ))}

        {cells.map((cell, index) => {
          if (!cell.date) return <div key={`blank-${index}`} />;

          const journalDay = dayByDate.get(cell.date);
          const scheduledEvents = eventsByDate.get(cell.date) ?? [];
          const tier = journalDay?.score !== null && journalDay?.score !== undefined ? getHealthTier(journalDay.score) : null;
          const keyNumber =
            journalDay && journalDay.totals.salesClosed > 0
              ? t("salesCount", { count: journalDay.totals.salesClosed, plural: journalDay.totals.salesClosed > 1 ? "s" : "" })
              : journalDay && journalDay.totals.callsAttended > 0
                ? t("callsCount", { count: journalDay.totals.callsAttended, plural: journalDay.totals.callsAttended > 1 ? "s" : "" })
                : null;
          const hasImprovement = (journalDay?.events.length ?? 0) > 0 || scheduledEvents.length > 0;

          return (
            <button
              key={cell.date}
              type="button"
              disabled={cell.isFuture}
              onClick={() => {
                const baseDay = journalDay ?? {
                  date: cell.date,
                  totals: { newSubscribers: 0, firstMessagesSent: 0, conversationsStarted: 0, callsProposed: 0, callsBooked: 0, callsAttended: 0, salesClosed: 0 },
                  hasActivity: false,
                  score: null,
                  events: [],
                  note: "",
                };
                const plannedEvents = scheduledEvents.map((event) => ({
                  id: `calendar:${event.id}`,
                  type: event.type,
                  label: event.label,
                  sourceId: event.id,
                  createdAt: new Date(`${event.date}T12:00:00.000Z`),
                }));
                setSelected({ ...baseDay, events: [...baseDay.events, ...plannedEvents] });
              }}
              className={cn(
                "flex aspect-square flex-col items-center justify-start gap-1 rounded-[10px] border border-transparent p-1.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                // Neutral emphasis for "today" — coral is reserved for
                // actions, not a locator.
                cell.isToday && "border-ink"
              )}
            >
              <span className="text-xs font-bold tabular-nums">{cell.day}</span>
              {tier && <span aria-hidden className="size-1.5 rounded-full" style={{ background: tier.colorBar }} />}
              {keyNumber && (
                <span className="hidden w-full truncate text-center text-[10px] leading-none text-muted-foreground tabular-nums sm:block">
                  {keyNumber}
                </span>
              )}
              {/* Positive/achievement marker, not coral — this signals a
                  completed improvement, closer to a "good" status than an
                  action. */}
              {hasImprovement && <span className="text-[11px] leading-none text-positive">✦</span>}
              {scheduledEvents.length > 0 && (
                <span className="rounded-full bg-accent-2-soft px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-accent-2-text" aria-label={t("scheduledCount", { count: scheduledEvents.length })}>
                  {scheduledEvents.length}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <DayDrawer day={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
