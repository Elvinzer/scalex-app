import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { settingKpiEntries } from "@/db/schema";
import { getCurrentUser } from "@/lib/current-user";
import { aggregateEntries, computeFunnelRates, findBottleneck } from "@/lib/setting/funnel";

import { BottleneckCard } from "./bottleneck-card";
import { CsvImport } from "./csv-import";
import { EntriesTable } from "./entries-table";
import { EntryForm } from "./entry-form";
import { FunnelChart } from "./funnel-chart";
import { StatTiles } from "./stat-tiles";

export default async function SettingPage() {
  const { userId } = await getCurrentUser();

  const entries = await db
    .select()
    .from(settingKpiEntries)
    .where(eq(settingKpiEntries.userId, userId))
    .orderBy(desc(settingKpiEntries.date));

  const hasEntries = entries.length > 0;
  const totals = aggregateEntries(entries);
  const rates = computeFunnelRates(totals);
  const bottleneck = findBottleneck(rates);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold">Setting</h1>
        <p className="mt-1 text-muted-foreground">
          Ton funnel de prospection, jour par jour — nouveaux abonnés, premiers messages,
          conversations, appels proposés et réservés.
        </p>
      </div>

      {!hasEntries && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucun KPI enregistré pour l&apos;instant</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoute ta première journée ci-dessous, ou importe un historique en CSV.
          </p>
        </div>
      )}

      {hasEntries && (
        <>
          <div className="sticker-card p-8">
            <p className="text-sm font-bold">Funnel</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cumul sur les {entries.length} jour{entries.length > 1 ? "s" : ""} enregistré
              {entries.length > 1 ? "s" : ""}.
            </p>
            <div className="mt-6">
              <FunnelChart
                totals={totals}
                rates={rates}
                bottleneckStage={bottleneck?.stage ?? null}
              />
            </div>
          </div>

          <StatTiles entriesAscending={[...entries].reverse()} totals={totals} />

          <BottleneckCard bottleneck={bottleneck} />
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

      {hasEntries && (
        <div>
          <p className="mb-3 text-sm font-bold">Historique</p>
          <EntriesTable entries={entries} />
        </div>
      )}
    </div>
  );
}
