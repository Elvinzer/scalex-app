"use client";

import { Calendar, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  formatRangeDates,
  formatTriggerLabel,
  PRESET_LABELS,
  previousMonthOptions,
  resolveDateRange,
  todayUtc,
  toIsoDate,
} from "@/lib/date-range";

const PREVIOUS_MONTHS_COUNT = 6;
const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

type ViewMonth = { year: number; month: number };

function shiftMonth({ year, month }: ViewMonth, delta: number): ViewMonth {
  const date = new Date(Date.UTC(year, month + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);

  const activePreset = searchParams.get("range") ?? "all";
  const activeRange = resolveDateRange(
    activePreset,
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined
  );

  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<string | null>(null);
  const [draftEnd, setDraftEnd] = useState<string | null>(null);
  const [leftMonth, setLeftMonth] = useState<ViewMonth>(() => {
    const today = todayUtc();
    return shiftMonth({ year: today.getUTCFullYear(), month: today.getUTCMonth() }, -1);
  });

  const monthOptions = useMemo(() => previousMonthOptions(PREVIOUS_MONTHS_COUNT), []);
  const rightMonth = useMemo(() => shiftMonth(leftMonth, 1), [leftMonth]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function navigate(params: Record<string, string>) {
    const query = new URLSearchParams(params);
    router.push(`${pathname}?${query.toString()}`);
  }

  function applyPreset(preset: string) {
    navigate({ range: preset });
    setOpen(false);
  }

  function applyCustomRange() {
    if (!draftStart || !draftEnd) return;
    navigate({ range: "custom", from: draftStart, to: draftEnd });
    setOpen(false);
  }

  function toggleOpen() {
    if (!open) {
      setDraftStart(activeRange?.from ?? null);
      setDraftEnd(activeRange?.to ?? null);
    }
    setOpen((value) => !value);
  }

  function handleDayClick(iso: string) {
    if (!draftStart || draftEnd) {
      setDraftStart(iso);
      setDraftEnd(null);
      return;
    }
    if (iso < draftStart) {
      setDraftEnd(draftStart);
      setDraftStart(iso);
    } else {
      setDraftEnd(iso);
    }
  }

  const triggerLabel = formatTriggerLabel(activePreset, activeRange, monthOptions);

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={toggleOpen}
        className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-bold hover:bg-muted/50"
      >
        <Calendar className="h-4 w-4" />
        {triggerLabel}
        <ChevronDown className="h-4 w-4" />
      </button>

      {open && (
        <div className="elevated absolute right-0 z-50 mt-2 flex w-[min(90vw,640px)] flex-col rounded-[var(--radius-card)] border border-border bg-card transition-opacity duration-150 sm:flex-row">
          <div className="flex w-full flex-col gap-1 border-b border-border p-3 sm:w-44 sm:border-b-0 sm:border-r">
            <PresetButton active={activePreset === "all"} onClick={() => applyPreset("all")}>
              {PRESET_LABELS.all}
            </PresetButton>
            <PresetButton
              active={activePreset === "current-month"}
              onClick={() => applyPreset("current-month")}
            >
              {PRESET_LABELS["current-month"]}
            </PresetButton>
            <PresetButton
              active={activePreset === "last-30-days"}
              onClick={() => applyPreset("last-30-days")}
            >
              {PRESET_LABELS["last-30-days"]}
            </PresetButton>
            <div className="my-1 border-t border-border" />
            {monthOptions.map((option) => (
              <PresetButton
                key={option.preset}
                active={activePreset === option.preset}
                onClick={() => applyPreset(option.preset)}
              >
                {option.label}
              </PresetButton>
            ))}
          </div>

          <div className="flex flex-1 flex-col p-3">
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setLeftMonth((value) => shiftMonth(value, -1))}
                aria-label="Mois précédent"
                className="rounded p-1 hover:bg-muted/50"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setLeftMonth((value) => shiftMonth(value, 1))}
                aria-label="Mois suivant"
                className="rounded p-1 hover:bg-muted/50"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row">
              <MonthGrid
                year={leftMonth.year}
                month={leftMonth.month}
                start={draftStart}
                end={draftEnd}
                onSelect={handleDayClick}
              />
              <MonthGrid
                year={rightMonth.year}
                month={rightMonth.month}
                start={draftStart}
                end={draftEnd}
                onSelect={handleDayClick}
              />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">
                {draftStart
                  ? formatRangeDates({ from: draftStart, to: draftEnd ?? draftStart })
                  : "Choisis une plage"}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted/50"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  disabled={!draftStart || !draftEnd}
                  onClick={applyCustomRange}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  Mettre à jour
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PresetButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1.5 text-left text-sm ${
        active ? "bg-primary/15 font-bold" : "hover:bg-muted/50"
      }`}
    >
      {children}
    </button>
  );
}

function MonthGrid({
  year,
  month,
  start,
  end,
  onSelect,
}: {
  year: number;
  month: number;
  start: string | null;
  end: string | null;
  onSelect: (iso: string) => void;
}) {
  const todayIso = toIsoDate(todayUtc());
  const firstWeekday = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) =>
      toIsoDate(new Date(Date.UTC(year, month, index + 1)))
    ),
  ];

  const monthLabel = capitalize(
    new Date(Date.UTC(year, month, 1)).toLocaleDateString("fr-FR", { month: "long" })
  );

  return (
    <div className="flex-1">
      <p className="mb-2 text-center text-sm font-bold">
        {monthLabel} {year}
      </p>
      <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="text-muted-foreground">
            {label}
          </span>
        ))}
        {cells.map((iso, index) => {
          if (!iso) return <span key={index} />;
          const inRange = Boolean(start && end && iso > start && iso < end);
          const isEndpoint = iso === start || iso === end;
          const isToday = iso === todayIso;

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onSelect(iso)}
              className={[
                "mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm tabular-nums",
                isEndpoint
                  ? "bg-primary text-primary-foreground"
                  : inRange
                    ? "bg-primary/15"
                    : "hover:bg-muted/50",
                isToday && !isEndpoint ? "ring-1 ring-inset ring-primary" : "",
              ].join(" ")}
            >
              {Number(iso.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
