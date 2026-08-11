import { ArrowRight, Zap } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";

import { formatEur } from "@/lib/currency";
import { formatPercent } from "@/lib/setting/funnel";
import type { AdaptiveFunnelStage, AdaptiveFunnelVariant } from "@/lib/acquisition-funnels/metrics";

const SHAPE_WIDTHS = [100, 86, 72, 58, 46, 34, 22] as const;
const SHAPE_COLORS = [
  "var(--bottleneck-stage-1)",
  "var(--bottleneck-stage-2)",
  "var(--bottleneck-stage-3)",
  "var(--bottleneck-stage-4)",
  "var(--bottleneck-stage-5)",
  "var(--bottleneck-stage-6)",
  "var(--bottleneck-stage-7)",
] as const;

function clipPath(index: number): string {
  const top = SHAPE_WIDTHS[index] ?? SHAPE_WIDTHS[0];
  const bottom = index < SHAPE_WIDTHS.length - 1 ? SHAPE_WIDTHS[index + 1] : Math.max(12, top - 12);
  const topLeft = (100 - top) / 2;
  const bottomLeft = (100 - bottom) / 2;
  return `polygon(${topLeft}% 0%, ${100 - topLeft}% 0%, ${100 - bottomLeft}% 100%, ${bottomLeft}% 100%)`;
}

function number(value: number | null, locale: string): string {
  return value === null ? "—" : new Intl.NumberFormat(locale).format(Math.round(value));
}

function rate(value: number | null, locale: string): string {
  return value === null ? "—" : formatPercent(value, locale);
}

function width(value: number | null, benchmark: number | null): string {
  if (value === null || benchmark === null || benchmark <= 0) return "0%";
  return `${Math.min(100, Math.max(0, (value / benchmark) * 100))}%`;
}

function StageShape({ stage, index, locale }: { stage: AdaptiveFunnelStage; index: number; locale: string }) {
  return (
    <div className="flex w-[104px] shrink-0 flex-col items-center">
      <div
        className={`flex h-14 w-full items-center justify-center text-base font-bold tabular-nums ${index >= 3 ? "text-text-on-dark" : "text-foreground"}`}
        style={{ backgroundColor: SHAPE_COLORS[index % SHAPE_COLORS.length], clipPath: clipPath(index) }}
        aria-hidden="true"
      >
        {number(stage.volume, locale)}
      </div>
      <span className="mt-1 text-center text-[10px] font-medium text-muted-foreground">{stage.unit}</span>
    </div>
  );
}

export async function AcquisitionFunnelMini({ variant }: { variant: AdaptiveFunnelVariant }) {
  const locale = await getLocale();
  const t = await getTranslations("app.acquisition.journey");

  return (
    <section className="sticker-card p-5 sm:p-6" aria-labelledby="journey-mini-funnel-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("funnelEyebrow")}</p>
          <h2 id="journey-mini-funnel-title" className="mt-1 text-lg font-bold">{t("funnelTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("funnelHelp")}</p>
        </div>
        {variant.bottleneckId && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-text">
            <Zap className="size-3.5" aria-hidden="true" />
            {t("bottleneckDetected")}
          </span>
        )}
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[120px_minmax(0,1fr)] lg:items-start">
        <div className="flex flex-wrap justify-center gap-2 lg:flex-col lg:items-center lg:gap-1">
          {variant.stages.map((stage, index) => <StageShape key={stage.id} stage={stage} index={index} locale={locale} />)}
        </div>
        <ol className="min-w-0 divide-y divide-border">
          {variant.stages.map((stage, index) => {
            const hasRate = stage.currentRate !== null && stage.benchmarkRate !== null;
            const isBottleneck = stage.id === variant.bottleneckId;
            return (
              <li key={stage.id} className="py-3 first:pt-0 last:pb-0">
                <Link
                  href={stage.sourceHref}
                  prefetch
                  className="group block rounded-[var(--radius-control)] outline-none transition-colors hover:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-accent/20"
                  title={t("detailFor", { label: stage.label })}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-xs font-bold text-muted-foreground tabular-nums">{index + 1}</span>
                    <span className="text-sm font-bold group-hover:text-accent-text">{stage.label}</span>
                    {isBottleneck && <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-primary-foreground uppercase"><Zap className="size-3" />{t("mainBottleneck")}</span>}
                    <ArrowRight className="ml-auto size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                  {index === 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">{t("startingPoint")}</p>
                  ) : (
                    <>
                      <div className="relative mt-2 h-2 overflow-visible rounded-full bg-muted" role={hasRate ? "meter" : "img"} aria-label={`${stage.label}: ${hasRate ? rate(stage.currentRate, locale) : t("toMeasure")}`}>
                        {hasRate && <div className="h-full rounded-full bg-accent" style={{ width: width(stage.currentRate, stage.benchmarkRate) }} />}
                        {hasRate && <span className="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-dark" style={{ left: "100%" }} aria-hidden="true" />}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                        <span className="font-bold text-accent-text">{t("you")}: {rate(stage.currentRate, locale)}</span>
                        <span className="text-muted-foreground">{t("benchmark")}: {rate(stage.benchmarkRate, locale)}</span>
                        <span className="text-muted-foreground">{t("value")}: {number(stage.volume, locale)}</span>
                        {stage.monthlyGain !== null && <span className="ml-auto font-bold text-accent-text">+{formatEur(stage.monthlyGain, locale)}{t("perMonth")}</span>}
                      </div>
                    </>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
