import { useLocale, useTranslations } from "next-intl";

import type { ClosingBySourceRow } from "@/lib/leads/stats";
import { formatPercent } from "@/lib/setting/funnel";

// "Closing par source" — one row per platform, sorted best-rate-first
// (already sorted by the caller, lib/leads/stats.ts), révèle la meilleure
// source. Sources with 0 leads worked this period aren't hidden — a "—"
// rate is itself informative (nothing came from there yet).
export function ClosingBySourceTable({ rows }: { rows: ClosingBySourceRow[] }) {
  const locale = useLocale();
  const t = useTranslations("pipeline");
  const withLeads = rows.filter((row) => row.leads > 0);

  if (withLeads.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("closingBySourceEmpty")}</p>;
  }

  return (
    <div className="sticker-card overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="p-3 text-left text-xs font-bold text-muted-foreground">{t("sourceLabel")}</th>
            <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("leads")}</th>
            <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("closed")}</th>
            <th className="p-3 text-right text-xs font-bold text-muted-foreground">{t("rate")}</th>
          </tr>
        </thead>
        <tbody>
          {withLeads.map((row) => (
            <tr key={row.source} className="border-b border-border last:border-0">
              <td className="p-3 font-bold">{t(`source.${row.source}`)}</td>
              <td className="p-3 text-right tabular-nums">{row.leads}</td>
              <td className="p-3 text-right tabular-nums">{row.closed}</td>
              <td className="p-3 text-right tabular-nums">{row.rate === null ? "—" : formatPercent(row.rate, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
