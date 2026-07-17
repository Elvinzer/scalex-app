import { desc, eq } from "drizzle-orm";

import { DateRangePicker } from "@/components/date-range-picker";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { aggregateClosingEntries, computeClosingRates } from "@/lib/closing/metrics";
import { formatRangeDates, previousEquivalentRange, resolveDateRange } from "@/lib/date-range";
import { getCurrentUser } from "@/lib/current-user";

import { ClosingTiles } from "./closing-tiles";
import { CsvImport } from "./csv-import";
import { EntriesTable } from "./entries-table";
import { EntryForm } from "./entry-form";

function paramValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function sumCallsBooked(entries: { date: string; callsBooked: number }[], range: { from: string; to: string } | null): number {
  const filtered = range
    ? entries.filter((entry) => entry.date >= range.from && entry.date <= range.to)
    : entries;
  return filtered.reduce((sum, entry) => sum + entry.callsBooked, 0);
}

export default async function ClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const { userId } = await getCurrentUser();
  const params = await searchParams;

  const [allEntries, allSettingEntries] = await Promise.all([
    db
      .select()
      .from(closingKpiEntries)
      .where(eq(closingKpiEntries.userId, userId))
      .orderBy(desc(closingKpiEntries.date)),
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, userId)),
  ]);

  const hasAnyEntries = allEntries.length > 0;

  const range = resolveDateRange(paramValue(params.range), paramValue(params.from), paramValue(params.to));
  const entries = range
    ? allEntries.filter((entry) => entry.date >= range.from && entry.date <= range.to)
    : allEntries;
  const hasEntriesInRange = entries.length > 0;

  const callsBooked = sumCallsBooked(allSettingEntries, range);
  const totals = aggregateClosingEntries(entries);
  const rates = computeClosingRates(totals, callsBooked);

  // Previous-period comparison — no meaningful "previous" window when
  // viewing all-time history, so it's skipped in that case.
  const previousRange = range ? previousEquivalentRange(range) : null;
  const previousEntries = previousRange
    ? allEntries.filter(
        (entry) => entry.date >= previousRange.from && entry.date <= previousRange.to
      )
    : [];
  const previousTotals = previousRange ? aggregateClosingEntries(previousEntries) : null;
  const previousRates = previousTotals
    ? computeClosingRates(previousTotals, sumCallsBooked(allSettingEntries, previousRange))
    : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Closing</h1>
        <p className="mt-1 text-muted-foreground">
          Ce qui se passe une fois l&apos;appel réservé : présence à l&apos;appel, et
          conversion en vente.
        </p>
      </div>

      {!hasAnyEntries && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucune donnée de closing enregistrée pour l&apos;instant</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoute ta première journée ci-dessous, ou importe un historique en CSV.
          </p>
        </div>
      )}

      {hasAnyEntries && (
        <div className="flex justify-end">
          <DateRangePicker />
        </div>
      )}

      {hasAnyEntries && !hasEntriesInRange && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucune donnée sur cette période</p>
          <p className="mt-1 text-sm text-muted-foreground">Choisis une autre plage ci-dessus.</p>
        </div>
      )}

      {hasEntriesInRange && (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            Cumul sur {entries.length} jour{entries.length > 1 ? "s" : ""}
            {range ? ` — ${formatRangeDates(range)}` : " enregistrés"}.
          </p>
          <ClosingTiles
            entriesAscending={[...entries].reverse()}
            totals={totals}
            rates={rates}
            callsBooked={callsBooked}
            previousTotals={previousTotals}
            previousRates={previousRates}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="sticker-card p-8">
          <p className="text-sm font-bold">Ajouter un jour</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ressaisir une date déjà enregistrée la met à jour.
          </p>
          <div className="mt-6">
            <EntryForm />
          </div>
        </div>

        <div className="sticker-card p-8">
          <p className="text-sm font-bold">Importer un CSV</p>
          <div className="mt-6">
            <CsvImport />
          </div>
        </div>
      </div>

      {hasEntriesInRange && (
        <div>
          <p className="mb-3 text-sm font-bold">Historique</p>
          <EntriesTable entries={entries} />
        </div>
      )}
    </div>
  );
}
