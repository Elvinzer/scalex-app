import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { AgentBanner } from "@/components/agent-banner";
import { FunnelBlockConfigForm } from "@/components/funnel-block-config-form";
import { FunnelBlockDataForm } from "@/components/funnel-block-data-form";
import { FunnelSourceFilter } from "@/components/funnel-source-filter";
import { buildFunnelBlockStages, availableFunnelSources, type FunnelBlockStage } from "@/lib/funnel-blocks/metrics";
import { activeFunnelBlockEntries } from "@/lib/funnel-blocks/selection";
import { funnelBlockHref } from "@/lib/funnel-blocks/routes";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import type { FunnelBlockCatalogEntry, FunnelBlockSelection, FunnelSourceKey } from "@/lib/funnel-blocks/types";
import type { BusinessProfileData } from "@/lib/business/types";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";

export async function FunnelBlockPage({
  entry,
  selection,
  catalog,
  benchmarks,
  currentRow,
  monthlyRows,
  source,
  profile,
}: {
  entry: FunnelBlockCatalogEntry;
  selection: FunnelBlockSelection;
  catalog: FunnelBlockCatalogEntry[];
  benchmarks: Record<string, number | null>;
  currentRow: MonthlyMetricsRow | null;
  monthlyRows: MonthlyMetricsRow[];
  source: FunnelSourceKey | "total";
  profile: BusinessProfileData;
}) {
  const locale = await getLocale();
  const t = await getTranslations("funnelBlocks.page");
  const tCatalog = await getTranslations("funnelBlocks.catalog");
  const tFamily = await getTranslations("funnelBlocks.families");
  const tMetric = await getTranslations("funnelBlocks.metrics");
  const tSource = await getTranslations("funnelBlocks.sources");
  const blockLabel = tCatalog.has(`${entry.blockKey}.label`) ? tCatalog(`${entry.blockKey}.label`) : entry.label;
  const blockDescription = tCatalog.has(`${entry.blockKey}.description`) ? tCatalog(`${entry.blockKey}.description`) : entry.description;
  const metricLabel = (metricKey: string, fallback: string) => tMetric.has(`${metricKey}.label`) ? tMetric(`${metricKey}.label`) : fallback;
  const metricUnit = (metricKey: string, fallback: string) => tMetric.has(`${metricKey}.unit`) ? tMetric(`${metricKey}.unit`) : fallback;
  const blockLabelFor = (blockKey: string, fallback: string) => tCatalog.has(`${blockKey}.label`) ? tCatalog(`${blockKey}.label`) : fallback;
  const activeSources = selection.sources;
  const availableSources = availableFunnelSources(monthlyRows, activeSources);
  const effectiveSource = source !== "total" && availableSources.includes(source) ? source : "total";
  const stages = buildFunnelBlockStages({ entry, row: currentRow, source: effectiveSource, benchmarks });
  const orderedEntries = activeFunnelBlockEntries(selection, catalog);
  const journeyContext = `${orderedEntries.map((candidate) => tCatalog.has(`${candidate.blockKey}.label`) ? tCatalog(`${candidate.blockKey}.label`) : candidate.label).join(" → ")} · ${activeSources.map((sourceKey) => tSource(sourceKey)).join(", ")}`;
  const position = orderedEntries.findIndex((candidate) => candidate.blockKey === entry.blockKey);
  const weakest = stages.filter((stage) => stage.healthScore !== null).sort((a, b) => (a.healthScore ?? 0) - (b.healthScore ?? 0))[0] ?? null;

  return (
    <div className="flex flex-col gap-6" data-testid="funnel-block-page">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link href="/acquisition" className="text-xs font-bold text-accent-text hover:underline">← {t("back")}</Link>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-[-0.02em]">{blockLabel}</h1>
            <span className="rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">{tFamily(entry.family)}</span>
          </div>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{blockDescription}</p>
        </div>
        <FunnelSourceFilter sources={activeSources} availableSources={availableSources} value={effectiveSource} sourceHref={funnelBlockHref(entry.blockKey)} />
      </div>

      <AgentBanner
        stateText={weakest ? `${weakest.label} · ${formatRate(weakest.currentRate, locale)} / ${formatRate(weakest.benchmarkRate, locale)}` : t("toMeasure")}
        ctaLabel={t("improve")}
        chatContext={{ topicType: "general", topicKey: null, topicLabel: journeyContext, sourcePage: funnelBlockHref(entry.blockKey) }}
        period="current-month"
        gapBadge={weakest?.healthScore !== null && weakest?.healthScore !== undefined ? `${t("you")}: ${weakest.healthScore}%` : null}
        falcoSkin="acquisition"
      />

      <section aria-labelledby="funnel-block-position-title" className="sticker-card p-5 sm:p-6">
        <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("sequence")}</p>
        <h2 id="funnel-block-position-title" className="mt-1 text-lg font-bold">{t("sequence")}</h2>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {orderedEntries.map((candidate, index) => (
            <div key={candidate.blockKey} className="flex items-center gap-2">
              {index > 0 && <span className="text-muted-foreground" aria-hidden="true">→</span>}
              <Link href={funnelBlockHref(candidate.blockKey)} className={candidate.blockKey === entry.blockKey ? "rounded-full border-2 border-accent bg-accent-soft px-3 py-1.5 text-xs font-bold text-accent-text" : "rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold text-muted-foreground hover:border-border-hover"}>
                {blockLabelFor(candidate.blockKey, candidate.label)}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{position + 1} / {orderedEntries.length}</p>
      </section>

      <section aria-labelledby="funnel-block-metrics-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("metricsEyebrow")}</p>
            <h2 id="funnel-block-metrics-title" className="mt-1 text-lg font-bold">{t("metricsTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("metricsHelp")}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {stages.map((stage, index) => <MetricCard key={stage.id} stage={stage} index={index} locale={locale} t={t} metricLabel={metricLabel} metricUnit={metricUnit} />)}
        </div>
      </section>

      <MiniFunnel stages={stages} locale={locale} t={t} metricLabel={metricLabel} />

      <FunnelBlockDataForm
        entry={entry}
        row={currentRow}
        year={currentRow?.year ?? new Date().getUTCFullYear()}
        month={currentRow?.month ?? new Date().getUTCMonth() + 1}
        sources={activeSources}
        availableSources={availableSources}
        activeSource={effectiveSource}
      />

      <History entry={entry} rows={monthlyRows} source={effectiveSource} benchmarks={benchmarks} locale={locale} t={t} metricLabel={metricLabel} />

      <FunnelBlockConfigForm entry={entry} initial={profile.acquisition.blockConfigurations[entry.blockKey]} />
    </div>
  );
}

function MetricCard({
  stage,
  index,
  locale,
  t,
  metricLabel,
  metricUnit,
}: {
  stage: FunnelBlockStage;
  index: number;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  metricLabel: (metricKey: string, fallback: string) => string;
  metricUnit: (metricKey: string, fallback: string) => string;
}) {
  const tier = stage.healthScore === null ? null : getHealthTier(stage.healthScore);
  const tierClass = tier?.tier === "vert" ? "text-state-healthy" : tier?.tier === "ambre" ? "text-state-caution" : tier?.tier === "rouge" ? "text-state-critical" : "text-muted-foreground";
  return (
    <div className="sticker-card flex min-h-[150px] flex-col p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-bold text-muted-foreground tabular-nums">{index + 1}</span>
        <span className={`text-[11px] font-bold ${tierClass}`}>{stage.healthScore === null ? (stage.volume === null ? t("missing") : t("toMeasure")) : stage.healthScore >= 100 ? t("healthy") : stage.healthScore >= 70 ? t("caution") : t("critical")}</span>
      </div>
      <p className="mt-2 text-sm font-bold">{metricLabel(stage.metricKey, stage.label)}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{formatVolume(stage.volume, locale)} <span className="text-xs font-medium text-muted-foreground">{metricUnit(stage.metricKey, stage.unit)}</span></p>
      <div className="mt-auto flex flex-wrap justify-between gap-2 pt-3 text-xs text-muted-foreground">
        <span>{t("you")}: <strong className="text-foreground">{formatRate(stage.currentRate, locale)}</strong></span>
        <span>{t("benchmark")}: <strong className="text-foreground">{formatRate(stage.benchmarkRate, locale)}</strong></span>
      </div>
    </div>
  );
}

function MiniFunnel({ stages, locale, t, metricLabel }: { stages: FunnelBlockStage[]; locale: string; t: (key: string, values?: Record<string, string | number>) => string; metricLabel: (metricKey: string, fallback: string) => string }) {
  return (
    <section className="sticker-card p-5 sm:p-6" aria-labelledby="funnel-block-mini-title">
      <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("sequence")}</p>
      <h2 id="funnel-block-mini-title" className="mt-1 text-lg font-bold">{t("metricsTitle")}</h2>
      <div className="mt-5 flex flex-wrap items-end gap-2">
        {stages.map((stage, index) => (
          <div key={stage.id} className="flex min-w-[92px] flex-1 flex-col gap-1">
            <div className="flex h-12 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-sm font-bold tabular-nums text-accent-text">
              {formatVolume(stage.volume, locale)}
            </div>
            <span className="text-center text-[11px] font-medium text-muted-foreground">{index + 1}. {metricLabel(stage.metricKey, stage.label)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function History({
  entry,
  rows,
  source,
  benchmarks,
  locale,
  t,
  metricLabel,
}: {
  entry: FunnelBlockCatalogEntry;
  rows: MonthlyMetricsRow[];
  source: FunnelSourceKey | "total";
  benchmarks: Record<string, number | null>;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  metricLabel: (metricKey: string, fallback: string) => string;
}) {
  const snapshots = rows.slice().sort((a, b) => a.year - b.year || a.month - b.month).slice(-8);
  return (
    <section className="sticker-card p-5 sm:p-6" aria-labelledby="funnel-block-history-title">
      <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("historyEyebrow")}</p>
      <h2 id="funnel-block-history-title" className="mt-1 text-lg font-bold">{t("historyTitle")}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{t("historyHelp")}</p>
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[620px] divide-y divide-border">
          {entry.steps.map((step) => (
            <div key={step.metricKey} className="grid grid-cols-[150px_repeat(8,minmax(48px,1fr))] items-end gap-2 py-3">
              <span className="truncate text-xs font-bold">{metricLabel(step.metricKey, step.label)}</span>
              {snapshots.map((row) => {
                const value = buildFunnelBlockStages({ entry, row, source, benchmarks }).find((stage) => stage.metricKey === step.metricKey)?.volume ?? null;
                return <span key={`${row.year}-${row.month}`} className="text-center text-xs font-bold tabular-nums">{formatVolume(value, locale)}</span>;
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatVolume(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale).format(Math.round(value));
}

function formatRate(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(value);
}
