import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { settingKpiEntries } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { BENCHMARK_DISCLAIMER, getBenchmark } from "@/lib/setting/benchmarks";
import { formatRangeDates, previousEquivalentRange, resolveDateRange } from "@/lib/setting/date-range";
import { aggregateEntries, computeFunnelRates, findBottleneck } from "@/lib/setting/funnel";

import { BenchmarkMeter } from "./benchmark-meter";
import { BottleneckCard } from "./bottleneck-card";
import { CsvImport } from "./csv-import";
import { DateRangePicker } from "./date-range-picker";
import { EntriesTable } from "./entries-table";
import { EntryForm } from "./entry-form";
import { FunnelChart } from "./funnel-chart";
import { SectorPicker } from "./sector-picker";
import { StatTiles } from "./stat-tiles";

function paramValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export default async function SettingPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const { userId, user } = await getCurrentUser();
  const params = await searchParams;
  const sector = user?.sector ?? null;
  const benchmark = getBenchmark(sector);

  const allEntries = await db
    .select()
    .from(settingKpiEntries)
    .where(eq(settingKpiEntries.userId, userId))
    .orderBy(desc(settingKpiEntries.date));

  const hasAnyEntries = allEntries.length > 0;

  const range = resolveDateRange(paramValue(params.range), paramValue(params.from), paramValue(params.to));
  const entries = range
    ? allEntries.filter((entry) => entry.date >= range.from && entry.date <= range.to)
    : allEntries;
  const hasEntriesInRange = entries.length > 0;

  const totals = aggregateEntries(entries);
  const rates = computeFunnelRates(totals);
  const bottleneck = findBottleneck(rates);

  // Previous-period comparison for the stat tiles — no meaningful "previous"
  // window when viewing all-time history, so it's skipped in that case.
  const previousRange = range ? previousEquivalentRange(range) : null;
  const previousEntries = previousRange
    ? allEntries.filter(
        (entry) => entry.date >= previousRange.from && entry.date <= previousRange.to
      )
    : [];
  const previousTotals = previousRange ? aggregateEntries(previousEntries) : null;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Setting</h1>
        <p className="mt-1 text-muted-foreground">
          Ton funnel de prospection, jour par jour : nouveaux abonnés, premiers messages,
          conversations, appels proposés et réservés.
        </p>
      </div>

      {!hasAnyEntries && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucun KPI enregistré pour l&apos;instant</p>
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
        <>
          <div className="sticker-card p-8">
            <p className="text-sm font-bold">Funnel</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cumul sur {entries.length} jour{entries.length > 1 ? "s" : ""}
              {range ? ` — ${formatRangeDates(range)}` : " enregistrés"}.
            </p>
            <div className="mt-6">
              <FunnelChart
                totals={totals}
                rates={rates}
                bottleneckStage={bottleneck?.stage ?? null}
              />
            </div>
          </div>

          <StatTiles
            entriesAscending={[...entries].reverse()}
            totals={totals}
            previousTotals={previousTotals}
          />

          <BottleneckCard bottleneck={bottleneck} sector={sector} />

          <div className="sticker-card p-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm font-bold">Repères du marché</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Où tu te situes vs des ordres de grandeur du secteur, pour la prospection
                  chaude Instagram.
                </p>
              </div>
              <SectorPicker sector={sector} />
            </div>
            <div className="mt-6 grid gap-6 sm:grid-cols-2">
              <BenchmarkMeter
                label="Taux de réponse au 1er message"
                value={rates.responseRate}
                band={benchmark.responseRate}
              />
              <BenchmarkMeter
                label="Taux d'appels acceptés (sur proposés)"
                value={rates.bookingRate}
                band={benchmark.bookingRate}
              />
            </div>
            <p className="mt-6 text-xs text-muted-foreground">{BENCHMARK_DISCLAIMER}</p>
          </div>
        </>
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
