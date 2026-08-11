import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { AgentBanner } from "@/components/agent-banner";
import { DateRangePicker } from "@/components/date-range-picker";
import { getBenchmark } from "@/lib/benchmarks";
import type { ChatContext } from "@/lib/chat-context";
import { getCurrentUser } from "@/lib/current-user";
import { formatRangeDates, paramValue, previousEquivalentRange, resolveDateRange } from "@/lib/date-range";
import { resolveFalcoSkin } from "@/lib/falco-skins";
import { getExistingStageInsights } from "@/lib/funnel-insights/existing-insights";
import { aggregateSalesCallsInRange, isMonthlyCallSourceAvailable, type SalesCallKpiRecord } from "@/lib/monthly-metrics/call-source";
import { getMonthlyMetrics, getSalesCallKpiRecords, getSettingKpiEntries } from "@/lib/monthly-metrics/queries";
import { isExactCalendarMonth, resolveMonthSettingTotals, SETTING_FIELDS } from "@/lib/monthly-metrics/resolve";
import { computeFunnelRates, findBottleneck, type FunnelStage } from "@/lib/setting/funnel";
import { requirePermissionOrRedirect } from "@/lib/team/context";

import { BottleneckCard } from "./bottleneck-card";
import { CsvImport } from "./csv-import";
import { EntriesTable } from "./entries-table";
import { EntryForm } from "./entry-form";
import { FunnelChart } from "./funnel-chart";
import { StatTiles } from "./stat-tiles";

// outreachRate is a FunnelStage but not one of the 5 diagnostic-engine
// MetricKeys (lib/diagnostic/metric-keys.ts) — labelFor() only accepts real
// MetricKeys, so it needs its own label for the stateText sentence below.
function stageLabel(stage: FunnelStage, t: (key: string) => string): string {
  if (stage === "outreachRate") return t("funnel.outreachRate");
  return t(`funnel.${stage}`);
}

function resolveCanonicalSettingTotals(
  monthlyRow: Awaited<ReturnType<typeof getMonthlyMetrics>>,
  entries: Parameters<typeof resolveMonthSettingTotals>[1],
  callRecords: readonly SalesCallKpiRecord[],
  range: { from: string; to: string } | null
) {
  const baseTotals = resolveMonthSettingTotals(monthlyRow, entries);
  const monthlyIsAuthoritative = Boolean(
    monthlyRow?.settingManualOverride ||
      (monthlyRow && SETTING_FIELDS.some((field) => monthlyRow[field] !== null))
  );
  const callSource = aggregateSalesCallsInRange(callRecords, range ?? undefined);

  return !monthlyIsAuthoritative && isMonthlyCallSourceAvailable(callSource)
    ? { ...baseTotals, callsBooked: callSource.callsBooked }
    : baseTotals;
}

// The day-by-day view of Acquisition's funnel — was its own page
// (/acquisition/setting), folded in here as a nested route rather than a
// separate pillar sub-page: it's the same underlying prospection funnel
// Pipeline (../page.tsx) tracks at the lead level, just aggregated daily
// instead of per-lead. A real nested route, not a `?view=` query param,
// so DateRangePicker's own navigation (which replaces the full query
// string, see components/date-range-picker.tsx) doesn't need to know
// about a sibling param to preserve.
export default async function AcquisitionFunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string | string[]; from?: string | string[]; to?: string | string[] }>;
}) {
  const { userId, accountId, user } = await getCurrentUser();
  const t = await getTranslations("pipeline");
  const locale = await getLocale();
  await requirePermissionOrRedirect(userId, "acquisition:pipeline");
  const params = await searchParams;
  const sector = user?.sector ?? null;
  const benchmark = getBenchmark(sector);
  const hasWorkingKey = Boolean(user?.anthropicApiKeyEncrypted) && !user?.anthropicApiKeyInvalid;

  const [allEntries, callRecords, existingInsights] = await Promise.all([
    getSettingKpiEntries(accountId),
    getSalesCallKpiRecords(accountId),
    getExistingStageInsights(accountId),
  ]);

  const hasAnyEntries = allEntries.length > 0 || callRecords.length > 0;

  const range = resolveDateRange(paramValue(params.range), paramValue(params.from), paramValue(params.to));
  const entries = range
    ? allEntries.filter((entry) => entry.date >= range.from && entry.date <= range.to)
    : allEntries;
  const callSource = aggregateSalesCallsInRange(callRecords, range ?? undefined);
  const hasEntriesInRange = entries.length > 0 || isMonthlyCallSourceAvailable(callSource);

  // When the selected range is exactly one calendar month, a monthly_metrics
  // row for it (if any setting field is filled) wins wholesale over that
  // month's daily entries — resolveMonthSettingTotals falls back to the
  // daily aggregate unchanged when no such row exists (last-30-days/custom/
  // all-time ranges, or a month with nothing entered in /datas).
  const exactMonth = range ? isExactCalendarMonth(range) : null;
  const previousRange = range ? previousEquivalentRange(range) : null;
  const previousExactMonth = previousRange ? isExactCalendarMonth(previousRange) : null;

  const [monthlyRow, previousMonthlyRow] = await Promise.all([
    exactMonth ? getMonthlyMetrics(accountId, exactMonth.year, exactMonth.month) : Promise.resolve(null),
    previousExactMonth ? getMonthlyMetrics(accountId, previousExactMonth.year, previousExactMonth.month) : Promise.resolve(null),
  ]);

  const totals = resolveCanonicalSettingTotals(monthlyRow, entries, callRecords, range);
  const rates = computeFunnelRates(totals);
  const bottleneck = findBottleneck(rates);

  const previousEntries = previousRange
    ? allEntries.filter((entry) => entry.date >= previousRange.from && entry.date <= previousRange.to)
    : [];
  const previousTotals = previousRange
    ? resolveCanonicalSettingTotals(previousMonthlyRow, previousEntries, callRecords, previousRange)
    : null;

  const stateText =
    hasEntriesInRange && bottleneck
      ? t("funnel.bottleneckState", { stage: stageLabel(bottleneck.stage, t).toLowerCase(), rate: Math.round(bottleneck.rate * 100) })
      : t("funnel.noDataState");
  const chatContext: ChatContext = { topicType: "lever", topicKey: "setting", topicLabel: "Setting", sourcePage: "acquisition_pipeline_funnel" };
  const falcoSkin = resolveFalcoSkin("/ventes/pipeline");

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
          <h1 className="text-3xl font-bold">{t("funnel.title")}</h1>
          <p className="mt-1 text-muted-foreground">{t("funnel.subtitle")}</p>
        </div>
        <Link href="/ventes/pipeline" className="text-sm font-bold text-muted-foreground hover:underline">
          ← {t("funnel.back")}
        </Link>
      </div>

      {!hasAnyEntries && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">{t("funnel.noKpis")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("funnel.noKpisHelp")}</p>
        </div>
      )}

      {hasAnyEntries && (
        <div className="flex justify-end">
          <DateRangePicker />
        </div>
      )}

      {hasAnyEntries && !hasEntriesInRange && (
        <div className="sticker-card-dashed p-6 text-center">
          <p className="text-sm font-bold">{t("funnel.noRange")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("funnel.chooseRange")}</p>
        </div>
      )}

      {hasEntriesInRange && (
        <>
          <div className="sticker-card p-8">
            <p className="text-sm font-bold">{t("funnel.funnel")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("funnel.cumulative", { count: entries.length || callSource.callsBooked, plural: (entries.length || callSource.callsBooked) > 1 ? "s" : "", suffix: range ? ` — ${formatRangeDates(range, locale)}` : ` ${t("funnel.history").toLowerCase()}` })}</p>
            <div className="mt-6">
              <FunnelChart totals={totals} rates={rates} bottleneckStage={bottleneck?.stage ?? null} />
            </div>
          </div>

          <StatTiles
            entriesAscending={[...entries].reverse()}
            totals={totals}
            previousTotals={previousTotals}
            benchmark={benchmark}
            existingInsights={existingInsights}
            hasWorkingKey={hasWorkingKey}
          />

          <BottleneckCard bottleneck={bottleneck} sector={sector} />
        </>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="sticker-card p-8">
          <p className="text-sm font-bold">{t("funnel.addDay")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("funnel.updateHelp")}</p>
          <div className="mt-6">
            <EntryForm />
          </div>
        </div>

        <div className="sticker-card p-8">
          <p className="text-sm font-bold">{t("funnel.importCsv")}</p>
          <div className="mt-6">
            <CsvImport />
          </div>
        </div>
      </div>

      {hasEntriesInRange && (
        <div>
          <p className="mb-3 text-sm font-bold">{t("funnel.history")}</p>
          <EntriesTable entries={entries} />
        </div>
      )}
    </div>
  );
}
