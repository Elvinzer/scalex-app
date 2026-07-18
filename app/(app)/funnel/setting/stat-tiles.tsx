import { ArrowDown, ArrowUp } from "lucide-react";

import { Sparkline } from "@/components/sparkline";
import { TileBenchmarkStrip } from "@/components/tile-benchmark-strip";
import type { settingKpiEntries } from "@/db/schema";
import type { FunnelStageKey } from "@/lib/agent/knowledge";
import type { getBenchmark } from "@/lib/benchmarks";
import { rate, formatPercent, type FunnelTotals } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

import { InsightTrigger } from "../insight-trigger";
import type { ExistingStageInsight } from "../stage-insight-panel";

type SettingKpiEntry = typeof settingKpiEntries.$inferSelect;

type CountTile = { type: "count"; key: keyof FunnelTotals; label: string };
type RateTile = {
  type: "rate";
  key: string;
  label: string;
  numeratorKey: keyof FunnelTotals;
  denominatorKey: keyof FunnelTotals;
  // Set only when this exact ratio matches a stage covered by the
  // StageInsightPanel / market-benchmark system (lib/agent/knowledge,
  // lib/benchmarks.ts) — omitted when the tile's ratio doesn't line up
  // precisely with that stage's formula (see "Taux d'appels réservés" below).
  stage?: FunnelStageKey;
  benchmarkKey?: "responseRate" | "bookingRate" | "showUpRate";
};

// Each rate tile's value is numerator/denominator computed straight from
// totals — not lib/setting/funnel.ts's FunnelRates, whose `bookingRate` is a
// proposal→booking stage rate used elsewhere (FunnelChart's connector,
// bottleneck detection) and stays as-is. "Taux d'appels réservés" here is a
// different, deliberately chosen ratio (réservés / 1er messages), so it's
// self-contained: whatever numerator/denominator is configured below is
// exactly what's displayed, with no risk of drifting from a shared formula.
// It's also why that tile gets neither `stage` nor `benchmarkKey`: it isn't
// the same ratio as any stage the insight/benchmark systems know about.
const TILES: (CountTile | RateTile)[] = [
  { type: "count", key: "newSubscribers", label: "Nouveaux abonnés" },
  { type: "count", key: "firstMessagesSent", label: "Premiers messages envoyés" },
  {
    type: "rate",
    key: "responseRate",
    label: "Taux de réponse au 1er message",
    numeratorKey: "conversationsStarted",
    denominatorKey: "firstMessagesSent",
    stage: "responseRate",
    benchmarkKey: "responseRate",
  },
  { type: "count", key: "conversationsStarted", label: "Conversations en cours" },
  { type: "count", key: "callsProposed", label: "Appels proposés" },
  {
    type: "rate",
    key: "proposalRate",
    label: "Taux d'appels proposés",
    numeratorKey: "callsProposed",
    denominatorKey: "conversationsStarted",
    stage: "proposalRate",
  },
  { type: "count", key: "callsBooked", label: "Appels réservés" },
  {
    type: "rate",
    key: "bookingRate",
    label: "Taux d'appels réservés",
    numeratorKey: "callsBooked",
    denominatorKey: "firstMessagesSent",
  },
];

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

// entriesAscending must be sorted oldest-first (chronological, for the
// sparkline direction to read left-to-right correctly). previousTotals is
// null when there's no comparable prior period (e.g. "all time" is selected).
export function StatTiles({
  entriesAscending,
  totals,
  previousTotals,
  benchmark,
  existingInsights,
}: {
  entriesAscending: SettingKpiEntry[];
  totals: FunnelTotals;
  previousTotals: FunnelTotals | null;
  benchmark: ReturnType<typeof getBenchmark>;
  existingInsights: Partial<Record<FunnelStageKey, ExistingStageInsight>>;
}) {
  const recent = entriesAscending.slice(-SPARKLINE_DAYS);
  const labels = recent.map((entry) => shortDate(entry.date));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
      {TILES.map((tile) => {
        if (tile.type === "count") {
          return (
            <div key={tile.key} className="sticker-card flex flex-col p-5">
              <p className="text-sm font-bold text-muted-foreground">{tile.label}</p>
              <p className="mt-2 font-display text-3xl font-bold">
                {NUMBER_FORMAT.format(totals[tile.key])}
              </p>
              <div className="mt-1 min-h-4">
                <CountDelta current={totals[tile.key]} previous={previousTotals?.[tile.key] ?? null} />
              </div>
              <div className="mt-auto pt-3">
                <Sparkline values={recent.map((entry) => entry[tile.key])} labels={labels} />
              </div>
            </div>
          );
        }

        const numerator = totals[tile.numeratorKey];
        const denominator = totals[tile.denominatorKey];
        const rateValue = rate(numerator, denominator);
        const previousRateValue = previousTotals
          ? rate(previousTotals[tile.numeratorKey], previousTotals[tile.denominatorKey])
          : null;
        const band = tile.benchmarkKey ? benchmark[tile.benchmarkKey] : null;

        return (
          <div
            key={tile.key}
            className="sticker-card flex flex-col border-violet/40 bg-paper-alt/60 p-5"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold text-muted-foreground">{tile.label}</p>
              {tile.stage && (
                <InsightTrigger
                  stage={tile.stage}
                  label={tile.label}
                  existingInsight={existingInsights[tile.stage] ?? null}
                />
              )}
            </div>
            <p className="mt-2 font-display text-3xl font-bold text-violet">
              {rateValue === null ? "—" : formatPercent(rateValue)}
            </p>
            <div className="mt-1 min-h-4">
              <RateDelta current={rateValue} previous={previousRateValue} />
            </div>
            <div className="mt-auto pt-3">
              <p className="text-xs text-muted-foreground">
                {NUMBER_FORMAT.format(numerator)} / {NUMBER_FORMAT.format(denominator)}
              </p>
              <TileBenchmarkStrip value={rateValue} band={band} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
