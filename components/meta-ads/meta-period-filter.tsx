"use client";

import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  META_PERIOD_OPTIONS,
  formatMetaPeriodRange,
  type MetaPeriodSelection,
  type MetaResolvedPeriod,
  metaPeriodSelectionLabel,
} from "@/lib/meta-ads/protocol";

const PERIOD_PARAM_KEYS = ["meta_days", "meta_range", "meta_from", "meta_to"] as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function periodQuery(selection: MetaPeriodSelection): Record<string, string> {
  if (selection.kind === "previous_month") return { meta_range: "previous_month" };
  if (selection.kind === "custom") return { meta_range: "custom", meta_from: selection.from, meta_to: selection.to };
  return { meta_days: String(selection.days) };
}

function selectionRange(selection: MetaPeriodSelection, period: MetaResolvedPeriod): { start: string; end: string } {
  return selection.kind === "custom" ? { start: selection.from, end: selection.to } : period;
}

export function MetaPeriodFilter({
  selection,
  period,
}: {
  selection: MetaPeriodSelection;
  period: MetaResolvedPeriod;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(period.start);
  const [draftTo, setDraftTo] = useState(period.end);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const maxDate = todayIso();
  const activeRange = selectionRange(selection, period);
  const activeLabel = selection.kind === "custom" ? formatMetaPeriodRange(activeRange) : metaPeriodSelectionLabel(selection);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function navigate(selectionToApply: MetaPeriodSelection) {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of PERIOD_PARAM_KEYS) params.delete(key);
    for (const [key, value] of Object.entries(periodQuery(selectionToApply))) params.set(key, value);
    startTransition(() => router.push(`${pathname}?${params.toString()}`, { scroll: false }));
    setOpen(false);
    setError(null);
  }

  function openPicker() {
    setDraftFrom(activeRange.start);
    setDraftTo(activeRange.end);
    setError(null);
    setOpen((value) => !value);
  }

  function applyCustomRange() {
    if (!draftFrom || !draftTo) {
      setError("Choisis une date de début et une date de fin.");
      return;
    }
    if (draftFrom > draftTo) {
      setError("La date de début doit précéder la date de fin.");
      return;
    }
    navigate({ kind: "custom", from: draftFrom, to: draftTo });
  }

  return (
    <div ref={containerRef} className="relative" data-testid="meta-period-filter" aria-busy={isPending}>
      <div className={`flex flex-wrap items-center rounded-[var(--radius-control)] border border-border bg-card p-1 ${isPending ? "opacity-60" : ""}`}>
        {META_PERIOD_OPTIONS.map((days) => {
          const active = selection.kind === "days" && selection.days === days;
          return (
            <button
              key={days}
              type="button"
              data-testid={`meta-period-${days}`}
              aria-pressed={active}
              disabled={isPending}
              onClick={() => navigate({ kind: "days", days })}
              className={`min-h-11 rounded-[var(--radius-control)] px-3 text-xs font-bold transition-colors ${active ? "bg-accent-2-soft text-accent-2-text" : "text-muted-foreground hover:bg-muted"}`}
            >
              {days} j
            </button>
          );
        })}
        <button
          type="button"
          data-testid="meta-period-previous-month"
          aria-pressed={selection.kind === "previous_month"}
          disabled={isPending}
          onClick={() => navigate({ kind: "previous_month" })}
          className={`min-h-11 rounded-[var(--radius-control)] px-3 text-xs font-bold transition-colors ${selection.kind === "previous_month" ? "bg-accent-2-soft text-accent-2-text" : "text-muted-foreground hover:bg-muted"}`}
        >
          Mois précédent
        </button>
        <button
          type="button"
          data-testid="meta-period-custom"
          aria-expanded={open}
          aria-haspopup="dialog"
          disabled={isPending}
          onClick={openPicker}
          className={`flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] px-3 text-xs font-bold transition-colors ${selection.kind === "custom" || open ? "bg-accent-2-soft text-accent-2-text" : "text-muted-foreground hover:bg-muted"}`}
        >
          <CalendarDays className="size-3.5" aria-hidden="true" />
          <span className="max-w-44 truncate">{selection.kind === "custom" ? activeLabel : "Personnalisée"}</span>
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-2 w-[min(92vw,24rem)] rounded-[var(--radius-card)] border border-border bg-card p-4 shadow-lg" role="dialog" aria-label="Choisir une plage personnalisée">
          <p className="font-bold">Plage personnalisée</p>
          <p className="mt-1 text-xs text-muted-foreground">Les données sont comparées à la période précédente de même durée.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-bold" htmlFor="meta-period-from">
              Du
              <input
                id="meta-period-from"
                data-testid="meta-period-from"
                type="date"
                value={draftFrom}
                max={draftTo || maxDate}
                onChange={(event) => {
                  setDraftFrom(event.target.value);
                  setError(null);
                }}
                className="min-h-11 rounded-[var(--radius-control)] border border-border bg-card px-2.5 text-sm font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-xs font-bold" htmlFor="meta-period-to">
              Au
              <input
                id="meta-period-to"
                data-testid="meta-period-to"
                type="date"
                value={draftTo}
                min={draftFrom}
                max={maxDate}
                onChange={(event) => {
                  setDraftTo(event.target.value);
                  setError(null);
                }}
                className="min-h-11 rounded-[var(--radius-control)] border border-border bg-card px-2.5 text-sm font-normal outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
              />
            </label>
          </div>
          {error && <p className="mt-3 text-xs font-bold text-state-critical" role="alert">{error}</p>}
          <p className="mt-3 text-xs text-muted-foreground">{draftFrom && draftTo ? formatMetaPeriodRange({ start: draftFrom, end: draftTo }) : "Sélectionne les deux dates."}</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => setOpen(false)}>Annuler</Button>
            <Button type="button" variant="accent2" size="sm" className="min-h-11" onClick={applyCustomRange} disabled={!draftFrom || !draftTo || isPending}>
              <Check className="size-3.5" />
              Appliquer
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
