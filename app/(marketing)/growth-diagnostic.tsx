"use client";

import { ArrowLeft, ArrowRight, Check, Download, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import type { MetricKey } from "@/lib/diagnostic/metric-keys";
import { cn } from "@/lib/utils";
import {
  calculateGrowthDiagnostic,
  GROWTH_AXES,
  questionsActives,
  type GrowthAnswers,
  type GrowthQuestion,
  type GrowthResult,
} from "@/lib/landing-diagnostic";

type GrowthDiagnosticProps = {
  benchmarks: Record<MetricKey, number>;
  fullPage?: boolean;
};

type DiagnosticPhase = "intro" | "quiz" | "report";

const INTRO_CARDS = ["card1", "card2", "card3", "card4"] as const;

function formatNumber(value: number, locale: string, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    maximumFractionDigits,
  }).format(value);
}

function formatCurrency(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-FR" : "en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.max(0, value));
}

function formatPercent(value: number, locale: string): string {
  return `${formatNumber(value * 100, locale, 1)} %`;
}

function formatAxisValue(
  value: number,
  unit: (typeof GROWTH_AXES)[number]["unit"],
  locale: string
): string {
  if (unit === "rate") return formatPercent(value, locale);
  if (unit === "currencyPerHour") return `${formatCurrency(value, locale)} / h`;
  return formatCurrency(value, locale);
}

function scoreStatus(score: number): "low" | "medium" | "good" | "excellent" {
  if (score < 40) return "low";
  if (score < 58) return "medium";
  if (score < 78) return "good";
  return "excellent";
}

function statusClasses(status: ReturnType<typeof scoreStatus>): string {
  if (status === "low") return "bg-state-critical-bg text-state-critical";
  if (status === "medium") return "bg-state-caution-bg text-state-caution";
  if (status === "good") return "bg-state-healthy-bg text-state-healthy";
  return "bg-accent-2-soft text-accent-2-text";
}

function IntroView({ onStart, fullPage }: { onStart: () => void; fullPage: boolean }) {
  const t = useTranslations("growthDiagnostic");

  return (
    <div className={cn("p-5 sm:p-7", fullPage && "mx-auto max-w-[760px] sm:p-9 lg:p-12")}>
      <div className="mb-5 text-center">
        <span className="inline-flex rounded-full border border-accent-border bg-accent-soft px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-accent-text">
          {t("intro.eyebrow")}
        </span>
        <h2
          aria-label={`${t("intro.title")} ${t("intro.titleAccent")}`}
          className="mt-4 text-[clamp(1.55rem,4vw,2rem)] leading-[1.08] font-bold tracking-tight text-foreground"
        >
          {t("intro.title")}{" "}<span className="text-accent">{t("intro.titleAccent")}</span>
        </h2>
        <p className="mx-auto mt-3 max-w-[420px] text-[13px] leading-relaxed text-muted-foreground">
          {t("intro.description")}
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2">
        {INTRO_CARDS.map((card) => (
          <div key={card} className="rounded-[12px] border border-border bg-surface-sunken/70 p-3 text-left">
            <p className="text-[11px] font-bold text-accent-text">{t(`intro.${card}Title`)}</p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t(`intro.${card}Description`)}</p>
          </div>
        ))}
      </div>

      <Button type="button" onClick={onStart} className="h-12 w-full rounded-[12px] text-[14px] font-semibold">
        {t("intro.start")}
        <ArrowRight aria-hidden className="size-4" />
      </Button>
      <p className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">{t("intro.note")}</p>
    </div>
  );
}

type QuestionStepProps = {
  question: GrowthQuestion;
  index: number;
  total: number;
  initialValue: GrowthAnswers[string] | undefined;
  onAnswer: (value: GrowthAnswers[string]) => void;
  onPrevious: (() => void) | undefined;
  fullPage: boolean;
};

function QuestionStep({ question, index, total, initialValue, onAnswer, onPrevious, fullPage }: QuestionStepProps) {
  const t = useTranslations("growthDiagnostic");
  const inputId = useId();
  const [inputValue, setInputValue] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setInputValue(question.type === "number" && initialValue !== undefined && initialValue !== null ? String(initialValue) : "");
    setSelected(question.type === "multi" && Array.isArray(initialValue) ? initialValue : []);
  }, [initialValue, question.id, question.type]);

  const progress = Math.min(100, Math.round(((index + 1) / total) * 100));

  const submitNumber = () => {
    const parsed = Number(inputValue.replace(/\s/g, "").replace(",", "."));
    if (inputValue.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) onAnswer(parsed);
  };

  const toggleSelection = (value: string) => {
    setSelected((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  };

  return (
    <div className={cn("p-5 sm:p-7", fullPage && "mx-auto max-w-[760px] sm:p-9 lg:p-12")}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-text">{t(`groups.${question.group}`)}</span>
        <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
          {t("quiz.progress", { current: index + 1, total })}
        </span>
      </div>
      <div className="mb-5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out" style={{ width: `${progress}%` }} />
      </div>

      <div key={question.id} className="animate-rise rounded-[16px] border border-border bg-card p-5 shadow-[var(--shadow-xs)] sm:p-6">
        <h2 className="max-w-[460px] text-[18px] leading-[1.3] font-bold tracking-tight text-foreground">{t(question.questionKey)}</h2>
        <p className="mt-2 max-w-[470px] text-[13px] leading-relaxed text-muted-foreground" id={`${inputId}-help`}>
          {t(question.helpKey)}
        </p>
        <div className="my-5 h-px bg-border" />

        {question.type === "number" && (
          <div>
            <label htmlFor={inputId} className="sr-only">
              {t("quiz.inputLabel")}
            </label>
            <div className="flex min-h-12 items-center gap-3 rounded-[12px] border border-input bg-surface-sunken px-4 transition-colors focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15">
              <input
                id={inputId}
                type="text"
                inputMode="decimal"
                value={inputValue}
                onChange={(event) => setInputValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submitNumber();
                }}
                placeholder={question.example}
                aria-describedby={`${inputId}-help`}
                className="min-w-0 flex-1 bg-transparent text-[19px] font-bold tabular-nums text-foreground outline-none placeholder:text-muted-foreground/50"
              />
              {question.suffixKey && <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{t(question.suffixKey)}</span>}
            </div>
            <Button
              type="button"
              onClick={submitNumber}
              disabled={inputValue.trim() === ""}
              className="mt-3 h-11 w-full rounded-[12px] text-[13px] font-semibold"
            >
              {t("quiz.continue")}
              <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        )}

        {question.type === "choice" && (
          <div className="flex flex-col gap-2">
            {question.options?.map((option) => {
              const isNotMeasured = option.value === null;
              return (
                <button
                  key={option.labelKey}
                  type="button"
                  onClick={() => onAnswer(option.value)}
                  className={`min-h-11 w-full rounded-[12px] border px-4 py-2.5 text-left text-[13px] font-medium leading-snug transition-colors hover:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                    isNotMeasured ? "border-dashed border-border text-muted-foreground" : "border-border bg-surface-sunken text-foreground"
                  }`}
                >
                  {t(option.labelKey)}
                </button>
              );
            })}
          </div>
        )}

        {question.type === "multi" && (
          <div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {question.options?.map((option) => {
                const optionValue = option.value;
                if (typeof optionValue !== "string") return null;
                const isSelected = selected.includes(optionValue);
                return (
                  <button
                    key={optionValue}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => toggleSelection(optionValue)}
                    className={`min-h-11 rounded-[12px] border px-3 py-2.5 text-left text-[12.5px] font-medium leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30 ${
                      isSelected ? "border-accent bg-accent-soft text-accent-text" : "border-border bg-surface-sunken text-foreground hover:border-accent"
                    }`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`inline-flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${
                          isSelected ? "border-accent bg-accent text-primary-foreground" : "border-border-hover bg-card"
                        }`}
                        aria-hidden
                      >
                        {isSelected && <Check className="size-3" strokeWidth={3} />}
                      </span>
                      {t(option.labelKey)}
                    </span>
                  </button>
                );
              })}
            </div>
            <Button
              type="button"
              onClick={() => onAnswer(selected)}
              variant={selected.length > 0 ? "default" : "outline"}
              className="mt-3 h-11 w-full rounded-[12px] text-[13px] font-semibold"
            >
              {selected.length === 0
                ? t("quiz.none")
                : t(selected.length === 1 ? "quiz.selectedOne" : "quiz.selectedMany", { count: selected.length })}
              <ArrowRight aria-hidden className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {onPrevious && (
        <button
          type="button"
          onClick={onPrevious}
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded-[8px] px-1 text-[12px] font-medium text-muted-foreground underline decoration-border-hover underline-offset-4 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        >
          <ArrowLeft aria-hidden className="size-3.5" />
          {t("quiz.previous")}
        </button>
      )}
    </div>
  );
}

function GrowthReport({ result, onRestart, fullPage }: { result: GrowthResult; onRestart: () => void; fullPage: boolean }) {
  const t = useTranslations("growthDiagnostic");
  const locale = useLocale();
  const status = scoreStatus(result.global);
  const bottleneckCapLabel = locale === "fr" ? "2,5" : "2.5";

  return (
      <div
        role="region"
        className={cn("animate-rise p-4 sm:p-6", fullPage && "p-6 sm:p-8 lg:p-10")}
        aria-labelledby="growth-diagnostic-result-title"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-text">{t("report.eyebrow")}</p>
          <h2 id="growth-diagnostic-result-title" className="mt-1 text-[22px] leading-tight font-bold tracking-tight text-foreground">
            {t("report.title")}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            aria-label={t("report.print")}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[9px] border border-border bg-card px-3 text-[11px] font-semibold text-foreground transition-colors hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <Download aria-hidden className="size-3.5" />
            <span className="hidden sm:inline">{t("report.print")}</span>
          </button>
          <button
            type="button"
            onClick={onRestart}
            aria-label={t("report.restart")}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[9px] border border-border bg-card px-3 text-[11px] font-semibold text-foreground transition-colors hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
          >
            <RotateCcw aria-hidden className="size-3.5" />
            <span className="hidden sm:inline">{t("report.restart")}</span>
          </button>
        </div>
      </div>

      <section className="sticker-spotlight p-5 sm:p-6" aria-label={t("report.bottleneckLabel")}>
        <div className="flex items-center gap-4">
          <div className="flex size-[88px] shrink-0 flex-col items-center justify-center rounded-full border-2 border-accent bg-accent/10 sm:size-[100px]">
            <span className="text-[34px] leading-none font-bold tabular-nums text-text-on-dark">{result.global}</span>
            <span className="mt-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-text-on-dark-muted">{t("report.outOf")}</span>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">{t("report.bottleneckLabel")}</p>
            <h3 className="mt-1 text-[20px] leading-tight font-bold text-text-on-dark">{t(`report.axisNames.${result.bottleneck.id}`)}</h3>
            <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${statusClasses(status)}`}>
              {t(`report.badges.${result.badgeKey}`)}
            </span>
          </div>
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-text-on-dark-muted">
          {t("report.rateMeasured", {
            current: formatAxisValue(result.bottleneck.rate, result.bottleneck.unit, locale),
            benchmark: formatAxisValue(result.bottleneck.target, result.bottleneck.unit, locale),
          })}
          {" "}
          {t("report.bottleneckMessage")}
        </p>
      </section>
      <p className="mt-3 rounded-[10px] border border-accent-2-border bg-accent-2-soft px-3 py-2 text-[11px] leading-relaxed text-accent-2-text">
        {t("report.benchmarkSource")}
      </p>

      <section className="mt-5 rounded-[16px] border border-border bg-card p-4 sm:p-5">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-text">{t("report.axesTitle")}</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{t("report.you")} / {t("report.benchmark")}</p>
          </div>
          <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">70 / 100</span>
        </div>
        <div className="space-y-4">
          {result.axisScores.map((axis) => {
            const axisStatus = scoreStatus(axis.score);
            const isBottleneck = axis.id === result.bottleneck.id;
            return (
              <div key={axis.id}>
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-bold text-foreground">{t(`report.axisNames.${axis.id}`)}</span>
                      {isBottleneck && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-text">{t("report.aimsBottleneck")}</span>}
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t(`report.axisDescription.${axis.id}`)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold ${statusClasses(axisStatus)}`}>
                      {t(`report.axisStatus.${axisStatus}`)}
                    </span>
                    <p className="mt-1 text-[13px] font-bold tabular-nums text-foreground">{axis.score}<span className="text-[10px] font-medium text-muted-foreground">/100</span></p>
                  </div>
                </div>
                <div className="relative mt-2 h-1.5 overflow-visible rounded-full bg-muted">
                  <div className={`h-full rounded-full ${isBottleneck ? "bg-accent" : "bg-accent-2"}`} style={{ width: `${axis.score}%` }} />
                  <span className="absolute -top-1.5 h-4 w-px bg-foreground" style={{ left: "70%" }} aria-hidden />
                </div>
                <div className="mt-1 flex justify-between gap-2 text-[10px] tabular-nums text-muted-foreground">
                  <span>{formatAxisValue(axis.rate, axis.unit, locale)}</span>
                  <span>{formatAxisValue(axis.target, axis.unit, locale)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className={fullPage ? "mt-5 grid gap-5 xl:grid-cols-2" : undefined}>
      <section className={cn("mt-5 rounded-[16px] border border-border bg-surface-sunken/60 p-4 sm:p-5", fullPage && "mt-0")}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-text">{t("report.funnelTitle")}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {([
            ["funnelAudience", result.funnel.audience, result.funnel.audience],
            ["funnelLeads", result.funnel.leads, result.funnel.projectedLeads],
            ["funnelAppointments", result.funnel.appointments, result.funnel.projectedAppointments],
            ["funnelAttended", result.funnel.attended, result.funnel.projectedAttended],
            ["funnelSales", result.funnel.sales, result.funnel.projectedSales],
          ] as Array<[string, number, number]>).map(([labelKey, current, projected]) => (
            <div key={labelKey} className="rounded-[10px] border border-border bg-card p-3">
              <p className="text-[10px] font-semibold text-muted-foreground">{t(`report.${labelKey}`)}</p>
              <p className="mt-2 text-[18px] font-bold tabular-nums text-foreground">{formatNumber(current, locale, 1)}</p>
              <p className="mt-1 text-[10px] font-medium tabular-nums text-accent-text">{formatNumber(projected, locale, 1)} {t("report.afterCorrection")}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={cn("mt-5 rounded-[16px] border border-accent-border bg-accent-soft p-4 sm:p-5", fullPage && "mt-0")}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-text">{t("report.projectionTitle")}</p>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <MetricCard label={t("report.currentRevenue")} value={formatCurrency(result.currentRevenue, locale)} />
          <MetricCard label={t("report.afterBottleneck")} value={formatCurrency(result.revenueAfterBottleneck, locale)} accent />
          <MetricCard
            label={result.hoursFreed > 0 ? t("report.freedHours") : t("report.monthlyGain")}
            value={result.hoursFreed > 0 ? `${formatNumber(result.hoursFreed, locale)} h` : `+ ${formatCurrency(result.bottleneckGain, locale)}`}
            positive
          />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          {t("report.correctionNote", { percent: 60 })} {result.bottleneckCapped && t("report.capNote", { cap: bottleneckCapLabel })}
        </p>
      </section>

      {result.angles.length > 0 && (
        <section className={cn("mt-5 rounded-[16px] border border-state-critical/20 bg-state-critical-bg/50 p-4 sm:p-5", fullPage && "mt-0 xl:col-span-2")}>
          <div className="flex items-baseline gap-2">
            <span className="text-[28px] leading-none font-bold tabular-nums text-state-critical">{result.angles.length}</span>
            <h3 className="text-[16px] font-bold text-foreground">{t("report.anglesTitle")}</h3>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{t("report.anglesIntro")}</p>
          <div className="mt-3 space-y-2">
            {result.angles.map((angle) => (
              <div key={angle.id} className="rounded-[10px] border border-state-critical/20 bg-card p-3">
                <p className="text-[12px] font-bold text-state-critical">{t(`angles.${angle.titleKey}.title`)}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t(`angles.${angle.detailKey}.detail`)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {result.roas !== null && (
        <section className={cn("mt-5 rounded-[16px] border border-border bg-card p-4 sm:p-5", fullPage && "mt-0")}>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-text">{t("report.adTitle")}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <MetricCard label={t("report.adBudget")} value={formatCurrency(result.adBudget, locale)} />
            <MetricCard label={t("report.adRevenue")} value={formatCurrency(result.adRevenue, locale)} />
            <MetricCard label={t("report.roas")} value={`${formatNumber(result.roas, locale, 1)}x`} positive={result.roas >= 3} />
          </div>
        </section>
      )}

      <section className={cn("mt-5 rounded-[16px] border border-border bg-card p-4 sm:p-5", fullPage && "mt-0 xl:col-span-2")}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-2-text">{t("report.leversTitle")}</p>
        <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{t("report.leversIntro")}</p>
        {result.levers.length === 0 ? (
          <p className="mt-3 rounded-[10px] border border-dashed border-border px-3 py-3 text-[11px] text-muted-foreground">{t("report.noLevers")}</p>
        ) : (
          <div className="mt-3 space-y-2">
            {result.levers.map((lever, index) => (
              <div key={lever.id} className="flex items-center gap-3 rounded-[10px] border border-border p-3">
                <span className="w-4 shrink-0 text-[11px] font-bold tabular-nums text-muted-foreground">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[12px] font-bold text-foreground">{t(`options.lever.${lever.id}`)}</p>
                    {lever.aimsBottleneck && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-text">{t("report.aimsBottleneck")}</span>}
                    <span className="text-[10px] text-muted-foreground">· {t(`levers.delays.${lever.id}`)}</span>
                  </div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t(`levers.notes.${lever.id}`)}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-bold tabular-nums text-accent-2-text">+ {formatCurrency(lever.amount, locale)}</p>
                  <p className="text-[10px] text-muted-foreground">{t("report.perMonth")}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className={cn("mt-5 grid gap-3 sm:grid-cols-2", fullPage && "mt-0 xl:col-span-2")}>
        <section className="rounded-[16px] border border-border bg-card p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("report.profileTitle")}</p>
          <h3 className="mt-2 text-[16px] font-bold text-foreground">{t(`report.profileNames.${result.profileKey}`)}</h3>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t(`report.profileDescriptions.${result.profileKey}`)}</p>
        </section>
        <section className="rounded-[16px] border border-accent-border bg-accent-soft p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-text">{t("report.nicheTitle")}</p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-[30px] leading-none font-bold tabular-nums text-accent-text">{result.nicheScore}</span>
            <span className="pb-1 text-[10px] font-bold uppercase tracking-wide text-accent-text">{t(`report.nicheBands.${result.nicheBandKey}`)}</span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t(`report.nicheDescriptions.${result.nicheBandKey}`)}</p>
        </section>
      </div>

      <section className={cn("sticker-spotlight mt-5 p-5 sm:p-6", fullPage && "mt-0 xl:col-span-2")}>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent">{t("report.potentialTitle")}</p>
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <MetricCard label={t("report.potentialCurrent")} value={formatCurrency(result.currentRevenue, locale)} dark />
          <MetricCard label={t("report.potentialBottleneck")} value={`+ ${formatCurrency(result.bottleneckGain, locale)}`} dark accent />
          <MetricCard label={t("report.potentialLevers")} value={`+ ${formatCurrency(result.leverGain, locale)}`} dark violet />
        </div>
        <div className="mt-3 rounded-[10px] border border-text-on-dark/10 bg-text-on-dark/5 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-text-on-dark-muted">{t("report.potentialTotal")}</p>
          <p className="mt-1 text-[24px] font-bold tabular-nums text-text-on-dark">{formatCurrency(result.totalPotential, locale)}</p>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-text-on-dark-muted">{t("report.disclaimer")}</p>
      </section>

      <section className={cn("mt-5 rounded-[16px] border border-accent-border bg-accent-soft p-5 text-center", fullPage && "mt-0 xl:col-span-2")}>
        <h3 className="text-[17px] font-bold text-foreground">{t("report.ctaTitle")}</h3>
        <p className="mx-auto mt-2 max-w-[420px] text-[12px] leading-relaxed text-muted-foreground">{t("report.ctaDescription")}</p>
        <Button asChild className="mt-4 h-11 rounded-[11px] px-5 text-[13px] font-semibold">
          <Link href="/sign-in?intent=trial&plan=solo">
            {t("report.cta")}
            <ArrowRight aria-hidden className="size-4" />
          </Link>
        </Button>
      </section>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent = false,
  positive = false,
  dark = false,
  violet = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  positive?: boolean;
  dark?: boolean;
  violet?: boolean;
}) {
  return (
    <div className={`rounded-[10px] border p-3 text-center ${dark ? "border-text-on-dark/10 bg-text-on-dark/5" : "border-border bg-card"}`}>
      <p className={`text-[9px] font-semibold uppercase tracking-[0.08em] ${dark ? "text-text-on-dark-muted" : "text-muted-foreground"}`}>{label}</p>
      <p className={`mt-1.5 text-[16px] font-bold leading-tight tabular-nums ${
        dark ? (violet ? "text-accent-2" : accent ? "text-accent" : "text-text-on-dark") : positive ? "text-state-healthy" : accent ? "text-accent-text" : "text-foreground"
      }`}>{value}</p>
    </div>
  );
}

export function GrowthDiagnostic({ benchmarks, fullPage = false }: GrowthDiagnosticProps) {
  const [phase, setPhase] = useState<DiagnosticPhase>("intro");
  const [answers, setAnswers] = useState<GrowthAnswers>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const activeQuestions = useMemo(() => questionsActives(answers), [answers]);
  const question = activeQuestions[questionIndex];
  const result = useMemo(() => (phase === "report" ? calculateGrowthDiagnostic(answers, benchmarks) : null), [answers, benchmarks, phase]);

  const answerQuestion = (value: GrowthAnswers[string]) => {
    if (!question) return;
    const nextAnswers = { ...answers, [question.id]: value };
    const nextQuestions = questionsActives(nextAnswers);
    const currentPosition = nextQuestions.findIndex((item) => item.id === question.id);
    setAnswers(nextAnswers);
    if (currentPosition + 1 < nextQuestions.length) {
      setQuestionIndex(currentPosition + 1);
      return;
    }
    setPhase("report");
  };

  const restart = () => {
    setAnswers({});
    setQuestionIndex(0);
    setPhase("intro");
  };

  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-[22px] border border-accent-border bg-card shadow-[var(--shadow-lg)]",
        fullPage && "mx-auto max-w-[1240px] rounded-[28px]"
      )}
    >
      {phase === "intro" && <IntroView onStart={() => setPhase("quiz")} fullPage={fullPage} />}
      {phase === "quiz" && question && (
        <QuestionStep
          question={question}
          index={questionIndex}
          total={activeQuestions.length}
          initialValue={answers[question.id]}
          onAnswer={answerQuestion}
          onPrevious={questionIndex > 0 ? () => setQuestionIndex((current) => Math.max(0, current - 1)) : undefined}
          fullPage={fullPage}
        />
      )}
      {phase === "report" && result && <GrowthReport result={result} onRestart={restart} fullPage={fullPage} />}
    </div>
  );
}
