"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { cn } from "@/lib/utils";

import { DayDrawer } from "./day-drawer";
import type { JournalDay } from "@/lib/journal/queries";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const MONTH_LABELS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Monday-first weekday index (0 = Monday .. 6 = Sunday) for JS's own
// Sunday-first getDay().
function mondayIndex(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

type CalendarCell = { date: string; day: number; isFuture: boolean; isToday: boolean };

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
}: {
  year: number;
  month: number;
  days: JournalDay[];
  todayIso: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<JournalDay | null>(null);
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const cells = buildGrid(year, month, todayIso);

  function goToMonth(nextYear: number, nextMonth: number) {
    router.push(`/journal?year=${nextYear}&month=${nextMonth}`);
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

  return (
    <div className="sticker-card p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-bold">
          {MONTH_LABELS[month - 1]} {year}
        </h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" onClick={handlePrev} aria-label="Mois précédent">
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={handleToday}>
            Aujourd&apos;hui
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={handleNext} aria-label="Mois suivant">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="pb-1 text-center text-[11px] font-bold text-muted-foreground">
            {label}
          </div>
        ))}

        {cells.map((cell, index) => {
          if (!cell.date) return <div key={`blank-${index}`} />;

          const journalDay = dayByDate.get(cell.date);
          const tier = journalDay?.score !== null && journalDay?.score !== undefined ? getHealthTier(journalDay.score) : null;
          const keyNumber =
            journalDay && journalDay.totals.salesClosed > 0
              ? `${journalDay.totals.salesClosed} vente${journalDay.totals.salesClosed > 1 ? "s" : ""}`
              : journalDay && journalDay.totals.callsAttended > 0
                ? `${journalDay.totals.callsAttended} appel${journalDay.totals.callsAttended > 1 ? "s" : ""}`
                : null;
          const hasImprovement = (journalDay?.events.length ?? 0) > 0;

          return (
            <button
              key={cell.date}
              type="button"
              disabled={cell.isFuture}
              onClick={() => setSelected(journalDay ?? { date: cell.date, totals: { newSubscribers: 0, firstMessagesSent: 0, conversationsStarted: 0, callsProposed: 0, callsBooked: 0, callsAttended: 0, salesClosed: 0 }, hasActivity: false, score: null, events: [], note: "" })}
              className={cn(
                "flex aspect-square flex-col items-center justify-start gap-1 rounded-[10px] border border-transparent p-1.5 text-left transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
                // Neutral emphasis for "today" — coral is reserved for
                // actions, not a locator.
                cell.isToday && "border-ink"
              )}
            >
              <span className="text-xs font-bold tabular-nums">{cell.day}</span>
              {tier && <span aria-hidden className="size-1.5 rounded-full" style={{ background: tier.colorBar }} />}
              {keyNumber && <span className="text-[10px] leading-none text-muted-foreground tabular-nums">{keyNumber}</span>}
              {/* Positive/achievement marker, not coral — this signals a
                  completed improvement, closer to a "good" status than an
                  action. */}
              {hasImprovement && <span className="text-[11px] leading-none text-positive">✦</span>}
            </button>
          );
        })}
      </div>

      <DayDrawer day={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
