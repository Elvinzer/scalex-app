import { ArrowDown, ArrowUp } from "lucide-react";

import type { settingKpiEntries } from "@/db/schema";
import { formatPercent, type FunnelRates, type FunnelTotals } from "@/lib/setting/funnel";
import { cn } from "@/lib/utils";

import { Sparkline } from "./sparkline";

type SettingKpiEntry = typeof settingKpiEntries.$inferSelect;

type CountTile = { type: "count"; key: keyof FunnelTotals; label: string };
type RateTile = {
  type: "rate";
  key: keyof FunnelRates;
  label: string;
  numeratorKey: keyof FunnelTotals;
  denominatorKey: keyof FunnelTotals;
};

// Order mirrors the funnel itself: each calculated rate sits right after the
// count it's derived from.
const TILES: (CountTile | RateTile)[] = [
  { type: "count", key: "newSubscribers", label: "Nouveaux abonnés" },
  { type: "count", key: "firstMessagesSent", label: "Premiers messages envoyés" },
  {
    type: "rate",
    key: "responseRate",
    label: "Taux de réponse au 1er message",
    numeratorKey: "conversationsStarted",
    denominatorKey: "firstMessagesSent",
  },
  { type: "count", key: "conversationsStarted", label: "Conversations en cours" },
  { type: "count", key: "callsProposed", label: "Appels proposés" },
  {
    type: "rate",
    key: "proposalRate",
    label: "Taux d'appels proposés",
    numeratorKey: "callsProposed",
    denominatorKey: "conversationsStarted",
  },
  { type: "count", key: "callsBooked", label: "Appels réservés" },
  {
    type: "rate",
    key: "bookingRate",
    label: "Taux d'appels réservés",
    numeratorKey: "callsBooked",
    denominatorKey: "callsProposed",
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
// sparkline direction to read left-to-right correctly). previousTotals/Rates
// are null when there's no comparable prior period (e.g. "all time" is selected).
export function StatTiles({
  entriesAscending,
  totals,
  rates,
  previousTotals,
  previousRates,
}: {
  entriesAscending: SettingKpiEntry[];
  totals: FunnelTotals;
  rates: FunnelRates;
  previousTotals: FunnelTotals | null;
  previousRates: FunnelRates | null;
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

        const rateValue = rates[tile.key];
        const numerator = totals[tile.numeratorKey];
        const denominator = totals[tile.denominatorKey];

        return (
          <div
            key={tile.key}
            className="sticker-card flex flex-col border-violet/40 bg-paper-alt/60 p-5"
          >
            <p className="text-sm font-bold text-muted-foreground">{tile.label}</p>
            <p className="mt-2 font-display text-3xl font-bold text-violet">
              {rateValue === null ? "—" : formatPercent(rateValue)}
            </p>
            <div className="mt-1 min-h-4">
              <RateDelta current={rateValue} previous={previousRates?.[tile.key] ?? null} />
            </div>
            <p className="mt-auto pt-3 text-xs text-muted-foreground">
              {NUMBER_FORMAT.format(numerator)} / {NUMBER_FORMAT.format(denominator)}
            </p>
          </div>
        );
      })}
    </div>
  );
}
