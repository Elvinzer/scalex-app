import { desc, eq } from "drizzle-orm";

import { DateRangePicker } from "@/components/date-range-picker";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { getBenchmark, type SectorKey } from "@/lib/benchmarks";
import { aggregateClosingEntries, computeClosingRates } from "@/lib/closing/metrics";
import { formatRangeDates, paramValue, resolveDateRange } from "@/lib/date-range";
import { getExistingStageInsights } from "@/lib/funnel-insights/existing-insights";
import { findOverviewBottleneck } from "@/lib/funnel/overview";
import { aggregateEntries, computeFunnelRates } from "@/lib/setting/funnel";

import { MarketBenchmarkAccordion } from "./market-benchmark-accordion";
import { OverviewBottleneckCard } from "./overview-bottleneck-card";
import { OverviewFunnelChart } from "./overview-funnel-chart";
import { OverviewTiles } from "./overview-tiles";

// Moved from app/(app)/funnel/page.tsx (was its own route) — Funnel is now
// the "Funnel" tab inside Diagnostic (app/(app)/diagnostic/page.tsx), which
// already gates the whole merged page on the "diagnostic" permission, so
// this tab doesn't repeat its own requirePermissionOrRedirect check.
export async function FunnelTab({
  accountId,
  sector,
  hasWorkingKey,
  searchParams,
}: {
  accountId: string;
  sector: SectorKey | null;
  hasWorkingKey: boolean;
  searchParams: { range?: string | string[]; from?: string | string[]; to?: string | string[] };
}) {
  const benchmark = getBenchmark(sector);

  const [allSettingEntries, allClosingEntries, existingInsights] = await Promise.all([
    db
      .select()
      .from(settingKpiEntries)
      .where(eq(settingKpiEntries.userId, accountId))
      .orderBy(desc(settingKpiEntries.date)),
    db
      .select()
      .from(closingKpiEntries)
      .where(eq(closingKpiEntries.userId, accountId))
      .orderBy(desc(closingKpiEntries.date)),
    getExistingStageInsights(accountId),
  ]);

  const hasAnyEntries = allSettingEntries.length > 0 || allClosingEntries.length > 0;

  const range = resolveDateRange(paramValue(searchParams.range), paramValue(searchParams.from), paramValue(searchParams.to));
  const settingEntries = range
    ? allSettingEntries.filter((entry) => entry.date >= range.from && entry.date <= range.to)
    : allSettingEntries;
  const closingEntries = range
    ? allClosingEntries.filter((entry) => entry.date >= range.from && entry.date <= range.to)
    : allClosingEntries;
  const hasEntriesInRange = settingEntries.length > 0 || closingEntries.length > 0;

  const settingTotals = aggregateEntries(settingEntries);
  const settingRates = computeFunnelRates(settingTotals);
  const closingTotals = aggregateClosingEntries(closingEntries);
  const closingRates = computeClosingRates(closingTotals, settingTotals.callsBooked);
  const bottleneck = findOverviewBottleneck(settingRates, closingRates);

  const dayCount = new Set([
    ...settingEntries.map((entry) => entry.date),
    ...closingEntries.map((entry) => entry.date),
  ]).size;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Tout ton parcours, de l&apos;abonné à la vente conclue — en une seule vue.
        </p>
        {hasAnyEntries && <DateRangePicker />}
      </div>

      {!hasAnyEntries && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">Aucune donnée enregistrée pour l&apos;instant</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Ajoute tes premières journées dans Avancé → Suivi setting quotidien / Module closing quotidien.
          </p>
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
          <OverviewBottleneckCard bottleneck={bottleneck} />

          <div className="sticker-card p-8">
            <p className="text-sm font-bold">Funnel</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Cumul sur {dayCount} jour{dayCount > 1 ? "s" : ""}
              {range ? ` — ${formatRangeDates(range)}` : " enregistrés"}.
            </p>
            <div className="mt-6">
              <OverviewFunnelChart
                settingTotals={settingTotals}
                settingRates={settingRates}
                closingTotals={closingTotals}
                closingRates={closingRates}
                bottleneck={bottleneck}
              />
            </div>
          </div>

          <OverviewTiles
            newSubscribers={settingTotals.newSubscribers}
            responseRate={settingRates.responseRate}
            callsAttended={closingTotals.callsAttended}
            closingRate={closingRates.closingRate}
          />

          <MarketBenchmarkAccordion
            sector={sector}
            benchmark={benchmark}
            settingRates={settingRates}
            showUpRate={closingRates.showUpRate}
            closingRate={closingRates.closingRate}
            existingInsights={existingInsights}
            hasWorkingKey={hasWorkingKey}
          />
        </>
      )}
    </div>
  );
}
