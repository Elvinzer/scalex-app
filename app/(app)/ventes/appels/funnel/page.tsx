import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { AgentBanner } from "@/components/agent-banner";
import { DateRangePicker } from "@/components/date-range-picker";
import { db } from "@/db";
import { closingKpiEntries, settingKpiEntries } from "@/db/schema";
import { getBenchmark } from "@/lib/benchmarks";
import type { ChatContext } from "@/lib/chat-context";
import { computeClosingRates, findClosingBottleneck } from "@/lib/closing/metrics";
import { getCurrentUser } from "@/lib/current-user";
import { formatRangeDates, paramValue, previousEquivalentRange, resolveDateRange } from "@/lib/date-range";
import { resolveFalcoSkin } from "@/lib/falco-skins";
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

// The day-by-day view of the closing funnel — was its own page
// (/ventes/closing), folded in here as a nested route rather than a
// `?view=` param, same precedent as Acquisition/Pipeline's own /funnel
// (see app/(app)/acquisition/pipeline/funnel/page.tsx for why: a real
// nested route, not a query param, so DateRangePicker's own navigation
// — which rebuilds the query string from scratch — never drops it).
export default async function VentesFunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const locale = await getLocale();
  const t = await getTranslations("sales.closingFunnel");
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "ventes:appels");
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
    ? allEntries.filter((entry) => entry.date >= previousRange.from && entry.date <= previousRange.to)
    : [];
  const previousSettingEntries = previousRange
    ? allSettingEntries.filter((entry) => entry.date >= previousRange.from && entry.date <= previousRange.to)
    : [];
  const previousTotals = previousRange ? resolveMonthClosingTotals(previousMonthlyRow, previousEntries) : null;
  const previousRates = previousTotals
    ? computeClosingRates(previousTotals, resolveMonthSettingTotals(previousMonthlyRow, previousSettingEntries).callsBooked)
    : null;

  const stateText =
    hasEntriesInRange && bottleneck
      ? t("agentState", { stage: t(`stages.${bottleneck.stage}`).toLowerCase(), rate: Math.round(bottleneck.rate * 100) })
      : t("noDataState");
  const chatContext: ChatContext = { topicType: "lever", topicKey: "closing", topicLabel: "Closing", sourcePage: "ventes_appels_funnel" };
  const falcoSkin = resolveFalcoSkin("/ventes/appels");

  return (
    <div className="flex flex-col gap-8">
      <AgentBanner
        stateText={stateText}
        ctaLabel={t("improve")}
        chatContext={chatContext}
        mode="optimiser"
        falcoSkin={falcoSkin}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Link href="/ventes/appels" className="text-sm font-bold text-muted-foreground hover:underline">
          {t("back")}
        </Link>
      </div>

      {!hasAnyEntries && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">{t("noData")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("noDataHelp")}</p>
        </div>
      )}

      {hasAnyEntries && (
        <div className="flex justify-end">
          <DateRangePicker />
        </div>
      )}

      {hasAnyEntries && !hasEntriesInRange && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">{t("noRange")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("chooseRange")}</p>
        </div>
      )}

      {hasEntriesInRange && (
        <div>
          <p className="mb-4 text-sm text-muted-foreground">
            {t("cumulative", { count: entries.length, plural: entries.length > 1 ? "s" : "", suffix: range ? ` — ${formatRangeDates(range, locale)}` : t("recorded") })}
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

      {hasEntriesInRange && <ClosingBottleneckCard bottleneck={bottleneck} sector={sector} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="sticker-card p-8">
          <p className="text-sm font-bold">{t("addDay")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("updateHelp")}</p>
          <div className="mt-6">
            <EntryForm />
          </div>
        </div>

        <div className="sticker-card p-8">
          <p className="text-sm font-bold">{t("importCsv")}</p>
          <div className="mt-6">
            <CsvImport />
          </div>
        </div>
      </div>

      {hasEntriesInRange && (
        <div>
          <p className="mb-3 text-sm font-bold">{t("history")}</p>
          <EntriesTable entries={entries} />
        </div>
      )}
    </div>
  );
}
