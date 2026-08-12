import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { FunnelSourceFilter } from "@/components/funnel-source-filter";
import { getHealthTier } from "@/lib/diagnostic/health-tier";
import { buildSequenceStages, availableFunnelSources, type FunnelBlockStage } from "@/lib/funnel-blocks/metrics";
import { activeFunnelBlockEntries } from "@/lib/funnel-blocks/selection";
import { funnelBlockHref } from "@/lib/funnel-blocks/routes";
import type { FunnelBlockCatalogEntry, FunnelBlockSelection, FunnelSourceKey } from "@/lib/funnel-blocks/types";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";

export async function FunnelSequenceOverview({
  selection,
  catalog,
  benchmarks,
  currentRow,
  monthlyRows,
  source,
}: {
  selection: FunnelBlockSelection;
  catalog: FunnelBlockCatalogEntry[];
  benchmarks: Record<string, number | null>;
  currentRow: MonthlyMetricsRow | null;
  monthlyRows: MonthlyMetricsRow[];
  source: FunnelSourceKey | "total";
}) {
  const locale = await getLocale();
  const t = await getTranslations("funnelBlocks.page");
  const tCatalog = await getTranslations("funnelBlocks.catalog");
  const tMetric = await getTranslations("funnelBlocks.metrics");
  const entries = activeFunnelBlockEntries(selection, catalog);
  const activeSources = selection.sources;
  const availableSources = availableFunnelSources(monthlyRows, activeSources);
  const effectiveSource = source !== "total" && availableSources.includes(source) ? source : "total";
  const stages = buildSequenceStages({ entries, row: currentRow, source: effectiveSource, benchmarks });
  const labels = new Map(entries.map((entry) => [entry.blockKey, tCatalog.has(`${entry.blockKey}.label`) ? tCatalog(`${entry.blockKey}.label`) : entry.label]));
  const metricLabel = (metricKey: string, fallback: string) => tMetric.has(`${metricKey}.label`) ? tMetric(`${metricKey}.label`) : fallback;
  const metricUnit = (metricKey: string, fallback: string) => tMetric.has(`${metricKey}.unit`) ? tMetric(`${metricKey}.unit`) : fallback;

  return (
    <section className="sticker-card p-5 sm:p-6" data-testid="acquisition-funnel-sequence" aria-labelledby="acquisition-funnel-sequence-title">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("sequence")}</p>
          <h2 id="acquisition-funnel-sequence-title" className="mt-1 text-xl font-bold">{t("metricsTitle")}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{t("metricsHelp")}</p>
        </div>
        <FunnelSourceFilter
          sources={activeSources}
          availableSources={availableSources}
          value={effectiveSource}
          sourceHref={entries[0] ? funnelBlockHref(entries[0].blockKey) : "/acquisition"}
          showUnavailableHelp={false}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2" aria-label={t("sequence")}>
        {entries.map((entry, index) => (
          <div key={entry.blockKey} className="flex items-center gap-2">
            {index > 0 && <span className="text-muted-foreground" aria-hidden="true">→</span>}
            <Link href={funnelBlockHref(entry.blockKey)} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-bold hover:border-border-hover">
              {labels.get(entry.blockKey) ?? entry.label}
            </Link>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {stages.map((stage, index) => <SequenceStage key={stage.id} stage={stage} index={index} blockLabel={labels.get(stage.blockKey) ?? stage.blockKey} locale={locale} t={t} metricLabel={metricLabel} metricUnit={metricUnit} />)}
      </div>

      {availableSources.length === 0 && (
        <p className="mt-4 text-xs text-muted-foreground">{t("sourceUnavailable")}</p>
      )}
    </section>
  );
}

function SequenceStage({
  stage,
  index,
  blockLabel,
  locale,
  t,
  metricLabel,
  metricUnit,
}: {
  stage: FunnelBlockStage;
  index: number;
  blockLabel: string;
  locale: string;
  t: (key: string, values?: Record<string, string | number>) => string;
  metricLabel: (metricKey: string, fallback: string) => string;
  metricUnit: (metricKey: string, fallback: string) => string;
}) {
  const tier = stage.healthScore === null ? null : getHealthTier(stage.healthScore);
  const tierClass = tier?.tier === "vert" ? "text-state-healthy" : tier?.tier === "ambre" ? "text-state-caution" : tier?.tier === "rouge" ? "text-state-critical" : "text-muted-foreground";
  const number = stage.volume === null ? "—" : new Intl.NumberFormat(locale).format(Math.round(stage.volume));
  const rate = stage.currentRate === null ? "—" : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(stage.currentRate);
  const benchmark = stage.benchmarkRate === null ? t("noBenchmark") : new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 }).format(stage.benchmarkRate);

  return (
    <Link href={funnelBlockHref(stage.blockKey)} className="group rounded-[var(--radius-control)] border border-border bg-background p-4 transition-colors hover:border-border-hover">
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-bold text-muted-foreground tabular-nums">{index + 1}</span>
        <span className={`text-[11px] font-bold ${tierClass}`}>{stage.healthScore === null ? (stage.volume === null ? t("missing") : t("toMeasure")) : stage.healthScore >= 100 ? t("healthy") : stage.healthScore >= 70 ? t("caution") : t("critical")}</span>
      </div>
      <p className="mt-2 text-[11px] font-bold tracking-[0.06em] text-muted-foreground uppercase">{blockLabel}</p>
      <p className="mt-1 text-sm font-bold group-hover:text-accent-text">{metricLabel(stage.metricKey, stage.label)}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{number} <span className="text-xs font-medium text-muted-foreground">{metricUnit(stage.metricKey, stage.unit)}</span></p>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{t("you")}: <strong className="text-foreground">{rate}</strong></span>
        <span>{t("benchmark")}: <strong className="text-foreground">{benchmark}</strong></span>
      </div>
    </Link>
  );
}
