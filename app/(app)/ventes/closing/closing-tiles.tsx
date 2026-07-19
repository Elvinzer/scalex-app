import { ArrowDown, ArrowUp } from "lucide-react";

import { Sparkline } from "@/components/sparkline";
import { TileBenchmarkStrip } from "@/components/tile-benchmark-strip";
import type { closingKpiEntries } from "@/db/schema";
import type { FunnelStageKey } from "@/lib/agent/knowledge";
import type { getBenchmark } from "@/lib/benchmarks";
import type { ClosingRates, ClosingTotals } from "@/lib/closing/metrics";
import { formatPercent } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

import { InsightTrigger } from "@/components/funnel-insights/insight-trigger";
import type { ExistingStageInsight } from "@/components/funnel-insights/stage-insight-panel";

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
  benchmark,
  existingInsights,
  hasWorkingKey,
}: {
  entriesAscending: ClosingKpiEntry[];
  totals: ClosingTotals;
  rates: ClosingRates;
  callsBooked: number;
  previousTotals: ClosingTotals | null;
  previousRates: ClosingRates | null;
  benchmark: ReturnType<typeof getBenchmark>;
  existingInsights: Partial<Record<FunnelStageKey, ExistingStageInsight>>;
  hasWorkingKey: boolean;
}) {
  const recent = entriesAscending.slice(-SPARKLINE_DAYS);
  const labels = recent.map((entry) => shortDate(entry.date));
  const missedCalls = Math.max(callsBooked - totals.callsAttended, 0);

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="sticker-card flex flex-col p-5">
        <p className="text-sm font-medium text-muted-foreground">Appels pris</p>
        <p className="mt-2 font-display text-3xl font-medium">
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
        <p className="text-sm font-medium text-muted-foreground">Ventes conclues</p>
        <p className="mt-2 font-display text-3xl font-medium">
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
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">Taux de closing</p>
          <InsightTrigger
            stage="closingRate"
            label="Taux de closing"
            existingInsight={existingInsights.closingRate ?? null}
            hasWorkingKey={hasWorkingKey}
          />
        </div>
        <p className="mt-2 font-display text-3xl font-medium text-violet">
          {rates.closingRate === null ? "—" : formatPercent(rates.closingRate)}
        </p>
        <div className="mt-1 min-h-4">
          <RateDelta current={rates.closingRate} previous={previousRates?.closingRate ?? null} />
        </div>
        <div className="mt-auto pt-3">
          <p className="text-xs text-muted-foreground">
            {NUMBER_FORMAT.format(totals.salesClosed)} / {NUMBER_FORMAT.format(totals.callsAttended)}
          </p>
          {/* closingRate has no market benchmark band today (lib/benchmarks.ts) */}
          <TileBenchmarkStrip value={null} band={null} />
        </div>
      </div>

      <div className="sticker-card flex flex-col border-violet/40 bg-paper-alt/60 p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">Taux de no-show</p>
          <InsightTrigger
            stage="showUpRate"
            label="Taux de présence à l'appel (show-up)"
            existingInsight={existingInsights.showUpRate ?? null}
            hasWorkingKey={hasWorkingKey}
          />
        </div>
        <p className="mt-2 font-display text-3xl font-medium text-violet">
          {rates.noShowRate === null ? "—" : formatPercent(rates.noShowRate)}
        </p>
        <div className="mt-1 min-h-4">
          <RateDelta current={rates.noShowRate} previous={previousRates?.noShowRate ?? null} />
        </div>
        <div className="mt-auto pt-3">
          <p className="text-xs text-muted-foreground">
            {NUMBER_FORMAT.format(missedCalls)} sur {NUMBER_FORMAT.format(callsBooked)} réservés
            (Setting)
          </p>
          {/* Same underlying ratio as the "présence à l'appel" benchmark,
              just formulated negatively — see ClosingRates.showUpRate. */}
          <TileBenchmarkStrip
            value={rates.showUpRate}
            band={benchmark.showUpRate}
            sublabel="vs marché (présence à l'appel)"
          />
        </div>
      </div>
    </div>
  );
}
