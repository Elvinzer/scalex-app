import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { getBusinessProfile } from "@/lib/business/queries";
import { getCurrentUser } from "@/lib/current-user";
import { currentMonthWindow } from "@/lib/diagnostic/completed-months";
import { getFunnelBlockBenchmarks, getFunnelBlockCatalog } from "@/lib/funnel-blocks/queries";
import { buildSequenceStages, type FunnelBlockStage } from "@/lib/funnel-blocks/metrics";
import { activeFunnelBlockEntries, normalizeFunnelBlockSelection } from "@/lib/funnel-blocks/selection";
import type { FunnelBlockCatalogEntry } from "@/lib/funnel-blocks/types";
import { getAllMonthlyMetrics, type MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";
import { requirePermissionOrRedirect } from "@/lib/team/context";
import { getHealthTier } from "@/lib/diagnostic/health-tier";

function formatVolume(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale).format(Math.round(value));
}

function formatRate(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value);
}

function monthLabel(row: Pick<MonthlyMetricsRow, "year" | "month">, locale: string): string {
  return new Date(Date.UTC(row.year, row.month - 1, 1)).toLocaleDateString(locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function statusKey(stage: FunnelBlockStage): "healthy" | "caution" | "critical" | "missing" | "toMeasure" {
  if (stage.volume === null) return "missing";
  if (stage.healthScore === null) return "toMeasure";
  const tier = getHealthTier(stage.healthScore);
  return tier?.tier === "vert" ? "healthy" : tier?.tier === "ambre" ? "caution" : "critical";
}

function blockLabel(entry: FunnelBlockCatalogEntry, tCatalog: (key: string) => string, hasKey: (key: string) => boolean): string {
  const key = `${entry.blockKey}.label`;
  return hasKey(key) ? tCatalog(key) : entry.label;
}

export default async function BottleneckDataPage() {
  const locale = await getLocale();
  const t = await getTranslations("data.bottleneck");
  const tCatalog = await getTranslations("funnelBlocks.catalog");
  const tMetric = await getTranslations("funnelBlocks.metrics");
  const { userId, accountId, user } = await getCurrentUser();
  await requirePermissionOrRedirect(userId, "datas");

  const [profile, catalog, monthlyRows] = await Promise.all([
    getBusinessProfile(accountId),
    getFunnelBlockCatalog(),
    getAllMonthlyMetrics(accountId),
  ]);
  const selection = normalizeFunnelBlockSelection(profile.acquisition, catalog);
  const entries = activeFunnelBlockEntries(selection, catalog);
  const benchmarks = await getFunnelBlockBenchmarks(entries.map((entry) => entry.blockKey), user?.sector ?? null);
  const currentMonth = currentMonthWindow();
  const currentRow = monthlyRows.find((row) => row.year === currentMonth.year && row.month === currentMonth.month) ?? null;
  const stages = buildSequenceStages({ entries, row: currentRow, source: "total", benchmarks });
  const historyRows = monthlyRows.slice().sort((a, b) => b.year - a.year || b.month - a.month).slice(0, 8).reverse();
  const labels = new Map(entries.map((entry) => [entry.blockKey, blockLabel(entry, tCatalog, (key) => tCatalog.has(key))]));
  const metricLabel = (metricKey: string, fallback: string) => tMetric.has(`${metricKey}.label`) ? tMetric(`${metricKey}.label`) : fallback;
  const metricUnit = (metricKey: string, fallback: string) => tMetric.has(`${metricKey}.unit`) ? tMetric(`${metricKey}.unit`) : fallback;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/datas" className="text-sm font-bold text-accent-text hover:underline">← {t("back")}</Link>
        <h1 className="mt-3 text-3xl font-bold">{t("title")}</h1>
        <p className="mt-1 max-w-3xl text-muted-foreground">{t("subtitle")}</p>
      </div>

      <section className="sticker-card p-5 sm:p-6" aria-labelledby="bottleneck-journey-title">
        <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("activeJourney")}</p>
        <h2 id="bottleneck-journey-title" className="mt-1 text-xl font-bold">
          {entries.map((entry) => labels.get(entry.blockKey) ?? entry.label).join(" → ")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("journeyHelp")}</p>
      </section>

      <section aria-labelledby="bottleneck-current-title">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("currentEyebrow")}</p>
          <h2 id="bottleneck-current-title" className="mt-1 text-xl font-bold">{t("currentTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("currentHelp", { month: monthLabel({ year: currentMonth.year, month: currentMonth.month }, locale) })}</p>
        </div>

        {stages.length === 0 ? (
          <div className="sticker-card-dashed mt-4 p-6 text-center">
            <p className="text-sm font-bold">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t("emptyHelp")}</p>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {stages.map((stage, index) => {
              const status = statusKey(stage);
              const statusClass = status === "healthy" ? "text-state-healthy" : status === "caution" ? "text-state-caution" : status === "critical" ? "text-state-critical" : "text-muted-foreground";
              return (
                <article key={stage.id} className="sticker-card flex min-h-[164px] flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs font-bold text-muted-foreground tabular-nums">{index + 1}</span>
                    <span className={`text-[11px] font-bold ${statusClass}`}>{t(`status.${status}`)}</span>
                  </div>
                  <p className="mt-2 text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">{labels.get(stage.blockKey) ?? stage.blockKey}</p>
                  <p className="mt-1 text-sm font-bold">{metricLabel(stage.metricKey, stage.label)}</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums">{formatVolume(stage.volume, locale)} <span className="text-xs font-medium text-muted-foreground">{metricUnit(stage.metricKey, stage.unit)}</span></p>
                  <div className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-3 text-xs text-muted-foreground">
                    <span>{t("yourRate")}: <strong className="text-foreground">{formatRate(stage.currentRate, locale)}</strong></span>
                    <span>{t("benchmark")}: <strong className="text-foreground">{formatRate(stage.benchmarkRate, locale)}</strong></span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {historyRows.length > 0 && stages.length > 0 && (
        <section className="sticker-card overflow-hidden p-5 sm:p-6" aria-labelledby="bottleneck-history-title">
          <div>
            <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("historyEyebrow")}</p>
            <h2 id="bottleneck-history-title" className="mt-1 text-xl font-bold">{t("historyTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("historyHelp")}</p>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-bold text-muted-foreground">
                  <th className="px-3 py-3">{t("stage")}</th>
                  {historyRows.map((row) => <th key={`${row.year}-${row.month}`} className="px-3 py-3 text-right">{monthLabel(row, locale)}</th>)}
                </tr>
              </thead>
              <tbody>
                {stages.map((stage) => (
                  <tr key={stage.id} className="border-b border-border last:border-0">
                    <th scope="row" className="px-3 py-3 text-left">
                      <span className="block text-xs font-bold text-muted-foreground">{labels.get(stage.blockKey) ?? stage.blockKey}</span>
                      <span className="block font-bold">{metricLabel(stage.metricKey, stage.label)}</span>
                    </th>
                    {historyRows.map((row) => {
                      const historyStage = buildSequenceStages({ entries, row, source: "total", benchmarks }).find((candidate) => candidate.id === stage.id);
                      return <td key={`${stage.id}-${row.year}-${row.month}`} className="px-3 py-3 text-right font-bold tabular-nums">{formatVolume(historyStage?.volume ?? null, locale)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="sticker-card-dashed p-5 text-sm text-muted-foreground">
        {t("canonicalSource")}
      </div>
    </div>
  );
}
