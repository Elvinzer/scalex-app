import type { settingKpiEntries } from "@/db/schema";
import type { FunnelTotals } from "@/lib/setting/funnel";

import { Sparkline } from "./sparkline";

type SettingKpiEntry = typeof settingKpiEntries.$inferSelect;

const TILES: { key: keyof FunnelTotals; label: string }[] = [
  { key: "newSubscribers", label: "Nouveaux abonnés" },
  { key: "firstMessagesSent", label: "Premiers messages envoyés" },
  { key: "conversationsStarted", label: "Conversations démarrées" },
  { key: "callsProposed", label: "Appels proposés" },
  { key: "callsBooked", label: "Appels réservés" },
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
}: {
  entriesAscending: SettingKpiEntry[];
  totals: FunnelTotals;
}) {
  const recent = entriesAscending.slice(-SPARKLINE_DAYS);
  const labels = recent.map((entry) => shortDate(entry.date));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {TILES.map((tile) => (
        <div key={tile.key} className="sticker-card p-6">
          <p className="text-sm font-bold text-muted-foreground">{tile.label}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">
            {totals[tile.key]}
          </p>
          <div className="mt-3">
            <Sparkline values={recent.map((entry) => entry[tile.key])} labels={labels} />
          </div>
        </div>
      ))}
    </div>
  );
}
