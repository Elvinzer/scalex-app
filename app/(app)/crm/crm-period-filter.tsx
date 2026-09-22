"use client";

import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { crmPeriodDateValue, formatCrmPeriodRange, type CrmPeriodPreset, CRM_PERIOD_PRESETS } from "@/lib/crm/period";

type ViewMonth = { year: number; month: number };

type CrmPeriodFilterProps = {
  activePreset: CrmPeriodPreset | "custom";
  from: string;
  to: string;
};

function shiftMonth({ year, month }: ViewMonth, delta: number): ViewMonth {
  const date = new Date(Date.UTC(year, month + delta, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

function currentViewMonth(): ViewMonth {
  const today = new Date();
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() };
}

function monthFromIso(value: string): ViewMonth | null {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCFullYear() < 2000) return null;
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function todayIso(): string {
  return crmPeriodDateValue(new Date());
}

export function CrmPeriodFilter({ activePreset, from, to }: CrmPeriodFilterProps) {
  const locale = useLocale();
  const t = useTranslations("crm");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [draftFrom, setDraftFrom] = useState<string | null>(null);
  const [draftTo, setDraftTo] = useState<string | null>(null);
  const [draftPreset, setDraftPreset] = useState<CrmPeriodPreset | "custom">(activePreset);
  const [error, setError] = useState<string | null>(null);
  const [leftMonth, setLeftMonth] = useState<ViewMonth>(() => {
    const selectedMonth = activePreset === "custom" ? monthFromIso(from) : null;
    return shiftMonth(selectedMonth ?? currentViewMonth(), -1);
  });

  const rightMonth = useMemo(() => shiftMonth(leftMonth, 1), [leftMonth]);
  const currentDate = todayIso();
  const rangeLabel = formatCrmPeriodRange(from, to, locale, t("kpis.periodPicker.rangeTo"));
  const presetLabel = t(`kpis.periodPicker.presets.${activePreset}`);
  const triggerLabel = activePreset === "all" ? presetLabel : `${presetLabel} : ${rangeLabel}`;

  function navigate(nextPreset: CrmPeriodPreset | "custom", nextFrom?: string, nextTo?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("range", nextPreset);
    if (nextPreset === "custom" && nextFrom && nextTo) {
      params.set("from", nextFrom);
      params.set("to", nextTo);
    } else {
      params.delete("from");
      params.delete("to");
    }
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
    setOpen(false);
    setError(null);
  }

  function openPicker() {
    setDraftPreset(activePreset);
    setDraftFrom(activePreset === "all" ? null : from);
    setDraftTo(activePreset === "all" ? null : to);
    setError(null);
    setLeftMonth((current) => {
      const selectedMonth = activePreset === "custom" ? monthFromIso(from) : null;
      return selectedMonth ? shiftMonth(selectedMonth, -1) : current;
    });
    setOpen((current) => !current);
  }

  function selectPreset(preset: CrmPeriodPreset) {
    setDraftPreset(preset);
    navigate(preset);
  }

  function applyCustomRange() {
    if (!draftFrom || !draftTo) {
      setError(t("kpis.periodPicker.rangeRequired"));
      return;
    }
    if (draftFrom > draftTo) {
      setError(t("kpis.periodPicker.rangeOrder"));
      return;
    }
    navigate("custom", draftFrom, draftTo);
  }

  function selectDay(iso: string) {
    if (!draftFrom || draftTo) {
      setDraftFrom(iso);
      setDraftTo(null);
      setError(null);
      return;
    }
    if (iso < draftFrom) {
      setDraftTo(draftFrom);
      setDraftFrom(iso);
    } else {
      setDraftTo(iso);
    }
    setError(null);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          onClick={openPicker}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={`${t("kpis.periodPicker.open")}: ${triggerLabel}`}
          disabled={isPending}
          className="min-h-11 max-w-full justify-between gap-2 px-3 sm:min-w-72"
        >
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-left">{triggerLabel}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        role="dialog"
        aria-label={t("kpis.periodPicker.title")}
        className="max-h-[calc(100dvh-1rem)] w-[min(94vw,58rem)] overflow-y-auto p-0"
      >
        <div className="flex flex-col lg:flex-row">
          <aside className="flex w-full shrink-0 flex-col gap-1 border-b border-border p-3 lg:w-52 lg:border-b-0 lg:border-r" aria-label={t("kpis.periodPicker.presetsTitle")}>
            <p className="px-2 pb-1 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">{t("kpis.periodPicker.presetsTitle")}</p>
            {CRM_PERIOD_PRESETS.map((preset) => (
              <PresetButton key={preset} active={draftPreset === preset} onClick={() => selectPreset(preset)}>
                {t(`kpis.periodPicker.presets.${preset}`)}
              </PresetButton>
            ))}
            <div className="my-1 border-t border-border" />
            <PresetButton active={draftPreset === "custom"} onClick={() => { setDraftPreset("custom"); setDraftFrom(activePreset === "all" ? null : from); setDraftTo(activePreset === "all" ? null : to); setError(null); }}>
              {t("kpis.periodPicker.presets.custom")}
            </PresetButton>
          </aside>

          <div className="min-w-0 flex-1 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-bold">{t("kpis.periodPicker.calendarTitle")}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t("kpis.periodPicker.timezone")}</p>
              </div>
              <div className="flex shrink-0 gap-1">
                <CalendarNavButton label={t("kpis.periodPicker.previousMonth")} onClick={() => setLeftMonth((current) => shiftMonth(current, -1))}>
                  <ChevronLeft className="size-4" aria-hidden="true" />
                </CalendarNavButton>
                <CalendarNavButton label={t("kpis.periodPicker.nextMonth")} onClick={() => setLeftMonth((current) => shiftMonth(current, 1))}>
                  <ChevronRight className="size-4" aria-hidden="true" />
                </CalendarNavButton>
              </div>
            </div>

            <div className="mt-4 grid min-w-0 gap-5 sm:grid-cols-2">
              <MonthGrid month={leftMonth} locale={locale} today={currentDate} start={draftFrom} end={draftTo} onSelect={selectDay} />
              <MonthGrid month={rightMonth} locale={locale} today={currentDate} start={draftFrom} end={draftTo} onSelect={selectDay} />
            </div>

            <div className="mt-5 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
              <DateInput label={t("kpis.periodPicker.from")} value={draftFrom ?? ""} max={draftTo ?? currentDate} onChange={setDraftFrom} />
              <DateInput label={t("kpis.periodPicker.to")} value={draftTo ?? ""} min={draftFrom ?? undefined} max={currentDate} onChange={setDraftTo} />
            </div>
            {error && <p className="mt-3 text-sm font-bold text-state-critical" role="alert">{error}</p>}
            <p className="mt-3 text-xs text-muted-foreground">
              {draftFrom && draftTo ? formatCrmPeriodRange(draftFrom, draftTo, locale, t("kpis.periodPicker.rangeTo")) : t("kpis.periodPicker.chooseRange")}
            </p>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" className="min-h-11" onClick={() => setOpen(false)}>{t("kpis.periodPicker.cancel")}</Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={applyCustomRange} disabled={!draftFrom || !draftTo || isPending}>{t("kpis.periodPicker.apply")}</Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PresetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className="flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-2.5 py-2 text-left text-sm font-bold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
    >
      <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${active ? "border-accent bg-accent" : "border-border bg-background"}`} aria-hidden="true">
        {active && <span className="size-1.5 rounded-full bg-accent-foreground" />}
      </span>
      <span>{children}</span>
    </button>
  );
}

function CalendarNavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20"
    >
      {children}
    </button>
  );
}

function DateInput({ label, value, min, max, onChange }: { label: string; value: string; min?: string; max?: string; onChange: (value: string) => void }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-xs font-bold">
      <span>{label}</span>
      <input type="date" value={value} min={min} max={max} onChange={(event) => onChange(event.target.value)} className="min-h-11 min-w-0 rounded-[var(--radius-control)] border border-border bg-background px-2.5 text-sm font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" />
    </label>
  );
}

function MonthGrid({ month, locale, today, start, end, onSelect }: { month: ViewMonth; locale: string; today: string; start: string | null; end: string | null; onSelect: (iso: string) => void }) {
  const firstWeekday = (new Date(Date.UTC(month.year, month.month, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(month.year, month.month + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, index) => crmPeriodDateValue(new Date(Date.UTC(month.year, month.month, index + 1)))),
  ];
  const monthLabel = capitalize(new Date(Date.UTC(month.year, month.month, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" }));
  const weekdayFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  const fullDateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "full", timeZone: "UTC" });

  return (
    <div className="min-w-0">
      <p className="mb-3 text-center text-sm font-bold">{monthLabel}</p>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index} className="py-1 text-muted-foreground">{weekdayFormatter.format(new Date(Date.UTC(2024, 0, index + 1)))}</span>
        ))}
        {cells.map((iso, index) => {
          if (!iso) return <span key={`empty-${index}`} className="min-h-11" aria-hidden="true" />;
          const isEndpoint = iso === start || iso === end;
          const inRange = Boolean(start && end && iso > start && iso < end);
          const isToday = iso === today;
          return (
            <button
              key={iso}
              type="button"
              aria-label={fullDateFormatter.format(new Date(`${iso}T00:00:00.000Z`))}
              aria-pressed={isEndpoint}
              onClick={() => onSelect(iso)}
              className={`flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius-control)] text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20 ${isEndpoint ? "bg-accent text-accent-foreground" : inRange ? "bg-accent-soft text-accent-text" : "hover:bg-muted"} ${isToday && !isEndpoint ? "ring-1 ring-inset ring-accent" : ""}`}
            >
              {Number(iso.slice(-2))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
