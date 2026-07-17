import type { settingKpiEntries } from "@/db/schema";
import { formatPercent, type FunnelRates, type FunnelTotals } from "@/lib/setting/funnel";

import { Sparkline } from "./sparkline";

type SettingKpiEntry = typeof settingKpiEntries.$inferSelect;

type CountTile = { type: "count"; key: keyof FunnelTotals; label: string };
type RateTile = { type: "rate"; key: keyof FunnelRates; label: string };

// Order mirrors the funnel itself: each calculated rate sits right after the
// count it's derived from.
const TILES: (CountTile | RateTile)[] = [
  { type: "count", key: "newSubscribers", label: "Nouveaux abonnés" },
  { type: "count", key: "firstMessagesSent", label: "1er message envoyé" },
  { type: "rate", key: "responseRate", label: "Taux de réponse 1er message" },
  { type: "count", key: "conversationsStarted", label: "Conv. en cours" },
  { type: "count", key: "callsProposed", label: "Call proposés" },
  { type: "rate", key: "proposalRate", label: "Taux de call proposés" },
  { type: "count", key: "callsBooked", label: "Call réservés" },
  { type: "rate", key: "bookingRate", label: "Taux de call réservés" },
];

const SPARKLINE_DAYS = 30;

function shortDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// entriesAscending must be sorted oldest-first (chronological, for the
// sparkline direction to read left-to-right correctly).
export function StatTiles({
  entriesAscending,
  totals,
  rates,
}: {
  entriesAscending: SettingKpiEntry[];
  totals: FunnelTotals;
  rates: FunnelRates;
}) {
  const recent = entriesAscending.slice(-SPARKLINE_DAYS);
  const labels = recent.map((entry) => shortDate(entry.date));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {TILES.map((tile) => {
        const rateValue = tile.type === "rate" ? rates[tile.key] : null;

        return (
          <div key={tile.key} className="sticker-card p-6">
            <p className="text-sm font-bold text-muted-foreground">{tile.label}</p>
            <p className="mt-2 font-display text-3xl font-bold tabular-nums">
              {tile.type === "count"
                ? totals[tile.key]
                : rateValue === null
                  ? "—"
                  : formatPercent(rateValue)}
            </p>
            <div className="mt-3">
              {tile.type === "count" ? (
                <Sparkline values={recent.map((entry) => entry[tile.key])} labels={labels} />
              ) : (
                <p className="text-xs text-muted-foreground">Calculé</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
