import type { settingKpiEntries } from "@/db/schema";

type SettingKpiEntry = typeof settingKpiEntries.$inferSelect;

const VISIBLE_ROWS = 30;

function formatDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// entries must already be sorted most-recent-first.
export function EntriesTable({ entries }: { entries: SettingKpiEntry[] }) {
  const visible = entries.slice(0, VISIBLE_ROWS);

  return (
    <div className="sticker-card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b-2 border-border text-left text-muted-foreground">
            <th className="px-4 py-3 font-bold">Date</th>
            <th className="px-4 py-3 font-bold">Abonnés</th>
            <th className="px-4 py-3 font-bold">Messages</th>
            <th className="px-4 py-3 font-bold">Conversations</th>
            <th className="px-4 py-3 font-bold">Appels proposés</th>
            <th className="px-4 py-3 font-bold">Appels réservés</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((entry) => (
            <tr key={entry.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5">{formatDate(entry.date)}</td>
              <td className="px-4 py-2.5 font-mono tabular-nums">{entry.newSubscribers}</td>
              <td className="px-4 py-2.5 font-mono tabular-nums">{entry.firstMessagesSent}</td>
              <td className="px-4 py-2.5 font-mono tabular-nums">
                {entry.conversationsStarted}
              </td>
              <td className="px-4 py-2.5 font-mono tabular-nums">{entry.callsProposed}</td>
              <td className="px-4 py-2.5 font-mono tabular-nums">{entry.callsBooked}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length > VISIBLE_ROWS && (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {entries.length - VISIBLE_ROWS} autre{entries.length - VISIBLE_ROWS > 1 ? "s" : ""}{" "}
          jour{entries.length - VISIBLE_ROWS > 1 ? "s" : ""} enregistré
          {entries.length - VISIBLE_ROWS > 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
