import type { settingKpiEntries } from "@/db/schema";
import { useLocale, useTranslations } from "next-intl";

import { EditableKpiCell } from "./editable-kpi-cell";

type SettingKpiEntry = typeof settingKpiEntries.$inferSelect;

const VISIBLE_ROWS = 30;

function formatDate(date: string, locale: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

// entries must already be sorted most-recent-first.
export function EntriesTable({ entries }: { entries: SettingKpiEntry[] }) {
  const locale = useLocale();
  const t = useTranslations("pipeline.funnel");
  const visible = entries.slice(0, VISIBLE_ROWS);

  return (
    <div className="sticker-card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b-2 border-border text-left text-muted-foreground">
            <th className="px-4 py-3 font-bold">{t("date")}</th>
            <th className="px-4 py-3 font-bold">{t("newSubscribers")}</th>
            <th className="px-4 py-3 font-bold">{t("firstMessages")}</th>
            <th className="px-4 py-3 font-bold">{t("conversations")}</th>
            <th className="px-4 py-3 font-bold">{t("callsProposed")}</th>
            <th className="px-4 py-3 font-bold">{t("callsBooked")}</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((entry) => (
            <tr key={entry.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5">{formatDate(entry.date, locale)}</td>
              <EditableKpiCell
                entryId={entry.id}
                field="newSubscribers"
                value={entry.newSubscribers}
              />
              <EditableKpiCell
                entryId={entry.id}
                field="firstMessagesSent"
                value={entry.firstMessagesSent}
              />
              <EditableKpiCell
                entryId={entry.id}
                field="conversationsStarted"
                value={entry.conversationsStarted}
              />
              <EditableKpiCell
                entryId={entry.id}
                field="callsProposed"
                value={entry.callsProposed}
              />
              <EditableKpiCell entryId={entry.id} field="callsBooked" value={entry.callsBooked} />
            </tr>
          ))}
        </tbody>
      </table>
      {entries.length > VISIBLE_ROWS && (
        <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {t("otherDays", { count: entries.length - VISIBLE_ROWS, plural: entries.length - VISIBLE_ROWS > 1 ? "s" : "" })}
        </p>
      )}
    </div>
  );
}
