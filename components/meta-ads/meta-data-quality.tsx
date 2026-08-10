import { formatPercent } from "@/lib/setting/funnel";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00.000Z`));
}

export function MetaDataQuality({
  coverageRate,
  missingDates,
  consolidatedThrough,
  initialSyncStatus,
}: {
  coverageRate: number | null;
  missingDates: string[];
  consolidatedThrough: string | null;
  initialSyncStatus: string;
}) {
  const partial = coverageRate !== null && coverageRate < 1;
  const preparing = initialSyncStatus !== "completed";
  if (!partial && !preparing && missingDates.length === 0) return null;

  const summary = preparing
    ? "Données Meta en préparation"
    : missingDates.length > 0 && (coverageRate === null || coverageRate === 1)
      ? `Données incomplètes · ${missingDates.length} jour${missingDates.length > 1 ? "s" : ""} manquant${missingDates.length > 1 ? "s" : ""}`
      : `Données partielles · ${coverageRate === null ? "couverture inconnue" : `${formatPercent(coverageRate)} couvert`}`;

  return (
    <details className="rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution/5 px-3 py-2 text-xs text-state-caution">
      <summary className="cursor-pointer list-none font-bold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/12">
        {summary}
      </summary>
      <div className="mt-2 space-y-1 border-t border-state-caution/20 pt-2 text-muted-foreground">
        {consolidatedThrough && <p>Données consolidées jusqu&apos;au {formatDate(consolidatedThrough)}.</p>}
        {missingDates.length > 0 && <p>{missingDates.length} jour(s) sans série Meta ; ces jours restent indisponibles.</p>}
        {partial && <p>Les périodes incomplètes ne sont pas complétées par des zéros.</p>}
      </div>
    </details>
  );
}
