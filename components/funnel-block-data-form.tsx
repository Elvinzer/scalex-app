"use client";

import { Check, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { saveFunnelBlockMetrics } from "@/app/(app)/acquisition/actions";
import { metricValueForSource } from "@/lib/funnel-blocks/metrics";
import type { FunnelBlockCatalogEntry, FunnelSourceKey } from "@/lib/funnel-blocks/types";
import type { MonthlyMetricsRow } from "@/lib/monthly-metrics/queries";

export function FunnelBlockDataForm({
  entry,
  row,
  year,
  month,
  sources,
  availableSources,
  activeSource,
}: {
  entry: FunnelBlockCatalogEntry;
  row: MonthlyMetricsRow | null;
  year: number;
  month: number;
  sources: FunnelSourceKey[];
  availableSources: FunnelSourceKey[];
  activeSource: FunnelSourceKey | "total";
}) {
  const locale = useLocale();
  const t = useTranslations("funnelBlocks.page");
  const tSource = useTranslations("funnelBlocks.sources");
  const tMetric = useTranslations("funnelBlocks.metrics");
  const router = useRouter();
  const editingSource = activeSource !== "total" && availableSources.includes(activeSource) ? activeSource : null;
  const initialValues = useMemo(
    () => Object.fromEntries(entry.steps.map((step) => [step.metricKey, metricValueForSource(row, step.metricKey, editingSource ?? "total")])) as Record<string, number | null>,
    [entry.steps, row, editingSource]
  );
  const initialSourceValues = useMemo(
    () => Object.fromEntries(sources.map((source) => [source, Object.fromEntries(entry.steps.map((step) => [step.metricKey, metricValueForSource(row, step.metricKey, source)]))])) as Record<string, Record<string, number | null>>,
    [entry.steps, row, sources]
  );
  const [values, setValues] = useState<Record<string, number | null>>(initialValues);
  const [sourceValues, setSourceValues] = useState<Record<string, Record<string, number | null>>>(initialSourceValues);
  const [showBreakdown, setShowBreakdown] = useState(Boolean(editingSource) || availableSources.length > 0);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const monthLabel = new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const stepLabel = (metricKey: string, fallback: string) => tMetric.has(`${metricKey}.label`) ? tMetric(`${metricKey}.label`) : fallback;
  const stepUnit = (metricKey: string, fallback: string) => tMetric.has(`${metricKey}.unit`) ? tMetric(`${metricKey}.unit`) : fallback;

  function updateValue(metricKey: string, value: string) {
    setSaved(false);
    setValues((current) => ({ ...current, [metricKey]: value.trim() === "" ? null : Number(value) }));
  }

  function updateSourceValue(source: FunnelSourceKey, metricKey: string, value: string) {
    setSaved(false);
    setSourceValues((current) => ({
      ...current,
      [source]: { ...(current[source] ?? {}), [metricKey]: value.trim() === "" ? null : Number(value) },
    }));
  }

  async function submit() {
    setError(null);
    const currentValues = editingSource ? {} : values;
    const bySource = { ...sourceValues };
    if (editingSource) bySource[editingSource] = values;
    const numericFields = [
      ...Object.values(values),
      ...Object.values(bySource).flatMap((sourceValues) => Object.values(sourceValues)),
    ];
    for (const field of numericFields) {
      if (field !== null && (!Number.isInteger(field) || field < 0)) {
        setError(t("invalidNumber"));
        return;
      }
    }
    setIsPending(true);
    const result = await saveFunnelBlockMetrics({ blockKey: entry.blockKey, year, month, metrics: currentValues, bySource });
    setIsPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="sticker-card p-5 sm:p-6" aria-labelledby="funnel-block-data-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("dataEyebrow")}</p>
          <h2 id="funnel-block-data-title" className="mt-1 text-lg font-bold">{t("dataTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("dataHelp", { month: monthLabel })}</p>
        </div>
        {saved && <span className="inline-flex items-center gap-1.5 text-xs font-bold text-state-healthy"><Check className="size-3.5" aria-hidden="true" />{t("saved")}</span>}
      </div>

      {editingSource && <p className="mt-4 rounded-[var(--radius-control)] bg-accent-soft px-3 py-2 text-xs font-bold text-accent-text">{t("sourceFiltered", { source: tSource(editingSource) })}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {entry.steps.map((step) => (
          <label key={step.metricKey} className="flex min-w-0 flex-col gap-1.5 rounded-[var(--radius-control)] border border-border bg-background p-3">
            <span className="flex items-start justify-between gap-2 text-sm font-bold">
              <span>{stepLabel(step.metricKey, step.label)}</span>
              <span className="shrink-0 text-xs font-medium text-muted-foreground">{stepUnit(step.metricKey, step.unit)}</span>
            </span>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={values[step.metricKey] ?? ""}
              onChange={(event) => updateValue(step.metricKey, event.target.value)}
              placeholder="—"
              className="w-full rounded-[var(--radius-control)] border border-border bg-card px-3 py-2 text-sm font-bold tabular-nums outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15"
            />
            <span className="text-[11px] text-muted-foreground">{step.metricKey === "sales_closed" ? t("shared") : t("manual")}</span>
          </label>
        ))}
      </div>

      {sources.length > 0 && (
        <div className="mt-5 rounded-[var(--radius-control)] border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold">{t("sourceBreakdown")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t("sourceBreakdownHelp")}</p>
            </div>
            <button type="button" aria-expanded={showBreakdown} onClick={() => setShowBreakdown((current) => !current)} className="min-h-11 rounded-full border border-border px-3 py-2 text-xs font-bold text-accent-text hover:bg-accent-soft">
              {showBreakdown ? "−" : "+"} {t("sourceBreakdown")}
            </button>
          </div>
          {showBreakdown && (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {sources.map((source) => (
                <div key={source} className="rounded-[var(--radius-control)] bg-surface-sunken p-3">
                  <p className="text-xs font-bold text-accent-text">{tSource(source)}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {entry.steps.map((step) => (
                      <label key={`${source}-${step.metricKey}`} className="flex flex-col gap-1 text-xs">
                        <span className="font-bold text-muted-foreground">{stepLabel(step.metricKey, step.label)}</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={sourceValues[source]?.[step.metricKey] ?? ""}
                          onChange={(event) => updateSourceValue(source, step.metricKey, event.target.value)}
                          placeholder="—"
                          className="rounded-[var(--radius-control)] border border-border bg-card px-2.5 py-2 font-bold tabular-nums outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-sm font-bold text-state-critical" role="alert">{error}</p>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Link href="/datas" className="text-sm font-bold text-accent-text hover:underline">{t("importData")}</Link>
        <Button type="button" variant="outline" onClick={() => void submit()} disabled={isPending}>
          {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {isPending ? t("saving") : t("saveConfiguration")}
        </Button>
      </div>
    </section>
  );
}
