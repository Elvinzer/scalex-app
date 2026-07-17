import { ArrowDown, ArrowUp } from "lucide-react";

import { Sparkline } from "@/components/sparkline";
import type { closingKpiEntries } from "@/db/schema";
import type { ClosingRates, ClosingTotals } from "@/lib/closing/metrics";
import { formatPercent } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

type ClosingKpiEntry = typeof closingKpiEntries.$inferSelect;

const SPARKLINE_DAYS = 30;
const NUMBER_FORMAT = new Intl.NumberFormat("fr-FR");

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function CountDelta({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) return null;
  const diff = current - previous;

  if (diff === 0) {
    return <p className="text-xs text-muted-foreground">= vs période précédente</p>;
  }

  const isUp = diff > 0;
  return (
    <p
      className={cn(
        "flex items-center gap-1 text-xs font-medium",
        isUp ? "text-state-healthy" : "text-state-critical"
      )}
    >
      {isUp ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {isUp ? "+" : ""}
      {NUMBER_FORMAT.format(diff)} vs période précédente
    </p>
  );
}

function RateDelta({ current, previous }: { current: number | null; previous: number | null }) {
  if (current === null || previous === null) return null;
  const diffPts = Math.round((current - previous) * 100);

  if (diffPts === 0) {
    return <p className="text-xs text-muted-foreground">= vs période précédente</p>;
  }

  const isUp = diffPts > 0;
  return (
    <p
      className={cn(
        "flex items-center gap-1 text-xs font-medium",
        isUp ? "text-state-healthy" : "text-state-critical"
      )}
    >
      {isUp ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />}
      {isUp ? "+" : ""}
      {diffPts} pts vs période précédente
    </p>
  );
}

// entriesAscending must be sorted oldest-first. previousTotals/Rates/CallsBooked
// are null when there's no comparable prior period (e.g. "all time" is selected).
export function ClosingTiles({
  entriesAscending,
  totals,
  rates,
  callsBooked,
  previousTotals,
  previousRates,
}: {
  entriesAscending: ClosingKpiEntry[];
  totals: ClosingTotals;
  rates: ClosingRates;
  callsBooked: number;
  previousTotals: ClosingTotals | null;
  previousRates: ClosingRates | null;
}) {
  const recent = entriesAscending.slice(-SPARKLINE_DAYS);
  const labels = recent.map((entry) => shortDate(entry.date));
  const missedCalls = Math.max(callsBooked - totals.callsAttended, 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sticker-card flex flex-col p-5">
        <p className="text-sm font-bold text-muted-foreground">Appels pris</p>
        <p className="mt-2 font-display text-3xl font-bold">
          {NUMBER_FORMAT.format(totals.callsAttended)}
        </p>
        <div className="mt-1 min-h-4">
          <CountDelta
            current={totals.callsAttended}
            previous={previousTotals?.callsAttended ?? null}
          />
        </div>
        <div className="mt-auto pt-3">
          <Sparkline values={recent.map((entry) => entry.callsAttended)} labels={labels} />
        </div>
      </div>

      <div className="sticker-card flex flex-col p-5">
        <p className="text-sm font-bold text-muted-foreground">Ventes conclues</p>
        <p className="mt-2 font-display text-3xl font-bold">
          {NUMBER_FORMAT.format(totals.salesClosed)}
        </p>
        <div className="mt-1 min-h-4">
          <CountDelta
            current={totals.salesClosed}
            previous={previousTotals?.salesClosed ?? null}
          />
        </div>
        <div className="mt-auto pt-3">
          <Sparkline values={recent.map((entry) => entry.salesClosed)} labels={labels} />
        </div>
      </div>

      <div className="sticker-card flex flex-col border-violet/40 bg-paper-alt/60 p-5">
        <p className="text-sm font-bold text-muted-foreground">Taux de closing</p>
        <p className="mt-2 font-display text-3xl font-bold text-violet">
          {rates.closingRate === null ? "—" : formatPercent(rates.closingRate)}
        </p>
        <div className="mt-1 min-h-4">
          <RateDelta current={rates.closingRate} previous={previousRates?.closingRate ?? null} />
        </div>
        <p className="mt-auto pt-3 text-xs text-muted-foreground">
          {NUMBER_FORMAT.format(totals.salesClosed)} / {NUMBER_FORMAT.format(totals.callsAttended)}
        </p>
      </div>

      <div className="sticker-card flex flex-col border-violet/40 bg-paper-alt/60 p-5">
        <p className="text-sm font-bold text-muted-foreground">Taux de no-show</p>
        <p className="mt-2 font-display text-3xl font-bold text-violet">
          {rates.noShowRate === null ? "—" : formatPercent(rates.noShowRate)}
        </p>
        <div className="mt-1 min-h-4">
          <RateDelta current={rates.noShowRate} previous={previousRates?.noShowRate ?? null} />
        </div>
        <p className="mt-auto pt-3 text-xs text-muted-foreground">
          {NUMBER_FORMAT.format(missedCalls)} sur {NUMBER_FORMAT.format(callsBooked)} réservés
          (Setting)
        </p>
      </div>
    </div>
  );
}
