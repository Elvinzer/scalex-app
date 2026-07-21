import { desc, eq } from "drizzle-orm";

import { DateRangePicker } from "@/components/date-range-picker";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { getBenchmark } from "@/lib/benchmarks";
import { computeClosingRates, findClosingBottleneck } from "@/lib/closing/metrics";
import { getCurrentUser } from "@/lib/current-user";
import { formatRangeDates, paramValue, previousEquivalentRange, resolveDateRange } from "@/lib/date-range";
import { getExistingStageInsights } from "@/lib/funnel-insights/existing-insights";
import { getMonthlyMetrics } from "@/lib/monthly-metrics/queries";
import {
  isExactCalendarMonth,
  resolveMonthClosingTotals,
  resolveMonthSettingTotals,
} from "@/lib/monthly-metrics/resolve";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { ClosingBottleneckCard } from "./closing-bottleneck-card";
import { ClosingTiles } from "./closing-tiles";
import { CsvImport } from "./csv-import";
import { EntriesTable } from "./entries-table";
import { EntryForm } from "./entry-form";

export default async function ClosingPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:closing");
  const params = await searchParams;
  const sector = user?.sector ?? null;
  const benchmark = getBenchmark(sector);
  const hasWorkingKey = Boolean(user?.anthropicApiKeyEncrypted) && !user?.anthropicApiKeyInvalid;

  const [allEntries, allSettingEntries, existingInsights] = await Promise.all([
    db
      .select()
      .from(closingKpiEntries)
      .where(eq(closingKpiEntries.userId, accountId))
      .orderBy(desc(closingKpiEntries.date)),
    db.select().from(settingKpiEntries).where(eq(settingKpiEntries.userId, accountId)),
    getExistingStageInsights(accountId),
  ]);

  const hasAnyEntries = allEntries.length > 0;

  const range = resolveDateRange(paramValue(params.range), paramValue(params.from), paramValue(params.to));
  const entries = range
    ? allEntries.filter((entry) => entry.date >= range.from && entry.date <= range.to)
    : allEntries;
  const hasEntriesInRange = entries.length > 0;

  // When the selected range is exactly one calendar month, a monthly_metrics
  // row for it (if any closing/setting field is filled) wins wholesale over
  // that month's daily entries — resolveMonthClosingTotals/
  // resolveMonthSettingTotals fall back to the daily aggregate unchanged
  // when no such row exists (last-30-days/custom/all-time ranges, or a month
  // with nothing entered in /datas).
  const exactMonth = range ? isExactCalendarMonth(range) : null;
  // Previous-period comparison — no meaningful "previous" window when
  // viewing all-time history, so it's skipped in that case. Computed before
  // either fetch fires so both go out in parallel below — previousExactMonth
  // only depends on `range` (already resolved), not on monthlyRow.
  const previousRange = range ? previousEquivalentRange(range) : null;
  const previousExactMonth = previousRange ? isExactCalendarMonth(previousRange) : null;

  const [monthlyRow, previousMonthlyRow] = await Promise.all([
    exactMonth ? getMonthlyMetrics(accountId, exactMonth.year, exactMonth.month) : Promise.resolve(null),
    previousExactMonth ? getMonthlyMetrics(accountId, previousExactMonth.year, previousExactMonth.month) : Promise.resolve(null),
  ]);

  const settingEntriesInRange = range
    ? allSettingEntries.filter((entry) => entry.date >= range.from && entry.date <= range.to)
    : allSettingEntries;
  const callsBooked = resolveMonthSettingTotals(monthlyRow, settingEntriesInRange).callsBooked;
  const totals = resolveMonthClosingTotals(monthlyRow, entries);
  const rates = computeClosingRates(totals, callsBooked);
  const bottleneck = findClosingBottleneck(rates);

  const previousEntries = previousRange
    ? allEntries.filter(
        (entry) => entry.date >= previousRange.from && entry.date <= previousRange.to
      )
    : [];
  const previousSettingEntries = previousRange
    ? allSettingEntries.filter((entry) => entry.date >= previousRange.from && entry.date <= previousRange.to)
    : [];
  const previousTotals = previousRange ? resolveMonthClosingTotals(previousMonthlyRow, previousEntries) : null;
  const previousRates = previousTotals
    ? computeClosingRates(previousTotals, resolveMonthSettingTotals(previousMonthlyRow, previousSettingEntries).callsBooked)
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
            benchmark={benchmark}
            existingInsights={existingInsights}
            hasWorkingKey={hasWorkingKey}
          />
        </div>
      )}

      {hasEntriesInRange && (
        <>
          <ClosingBottleneckCard bottleneck={bottleneck} sector={sector} />
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
