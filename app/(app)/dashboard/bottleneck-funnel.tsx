"use client";

import { ArrowRight, TrendingUp, Zap } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import type { ChatContext } from "@/lib/chat-context";
import { formatEur } from "@/lib/currency";
import type { BottleneckFunnelData, BottleneckStage, BottleneckStageId } from "@/lib/dashboard/bottleneck";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";
import { formatPercent } from "@/lib/setting/funnel";
import { Falco } from "@/components/falco/falco";
import { LazyImproveChat } from "@/components/lazy-improve-chat";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";

const STAGE_LABEL_KEYS: Record<BottleneckStageId, string> = {
  views: "views",
  clicks: "clicks",
  retention: "retention",
  leads: "leads",
  bookedCalls: "bookedCalls",
  attendedCalls: "attendedCalls",
  salesClosed: "salesClosed",
};

const STAGE_UNIT_KEYS: Record<BottleneckStageId, string> = {
  views: "viewsUnit",
  clicks: "clicksUnit",
  retention: "retentionUnit",
  leads: "leadsUnit",
  bookedCalls: "bookedCallsUnit",
  attendedCalls: "attendedCallsUnit",
  salesClosed: "salesClosedUnit",
};

// The prototype defines the funnel as seven matching-width boxes whose clip
// paths carry the taper. Keeping the boxes at 210px lets each row align with
// its metric column exactly, including when one row has a helper note.
const FUNNEL_BOUNDARY_WIDTHS = [100, 86, 72, 58, 46, 34, 22] as const;
const FUNNEL_SHAPE_COLORS = [
  "var(--bottleneck-stage-1)",
  "var(--bottleneck-stage-2)",
  "var(--bottleneck-stage-3)",
  "var(--bottleneck-stage-4)",
  "var(--bottleneck-stage-5)",
  "var(--bottleneck-stage-6)",
  "var(--bottleneck-stage-7)",
] as const;

function funnelClipPath(index: number): string {
  const top = FUNNEL_BOUNDARY_WIDTHS[index] ?? FUNNEL_BOUNDARY_WIDTHS[0];
  const bottom = index < FUNNEL_BOUNDARY_WIDTHS.length - 1 ? FUNNEL_BOUNDARY_WIDTHS[index + 1] : top - 12;
  const topLeft = (100 - top) / 2;
  const bottomLeft = (100 - bottom) / 2;
  return `polygon(${topLeft}% 0%, ${100 - topLeft}% 0%, ${100 - bottomLeft}% 100%, ${bottomLeft}% 100%)`;
}

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale).format(Math.round(value));
}

function formatSignedPercent(value: number, locale: string): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${new Intl.NumberFormat(locale).format(rounded)} pts`;
}

function stageLabel(t: ReturnType<typeof useTranslations>, stage: BottleneckStage): string {
  return t(`bottleneckFunnel.${STAGE_LABEL_KEYS[stage.id]}`);
}

function stageUnit(t: ReturnType<typeof useTranslations>, stage: BottleneckStage): string {
  return t(`bottleneckFunnel.${STAGE_UNIT_KEYS[stage.id]}`);
}

function stageSourceHref(stage: BottleneckStage): string {
  switch (stage.id) {
    case "views":
    case "clicks":
    case "retention":
      return "/acquisition/contenu";
    case "leads":
      return stage.source === "pipeline" ? "/acquisition/pipeline?view=stage" : "/acquisition/contenu";
    case "bookedCalls":
      return "/acquisition/pipeline/funnel";
    case "attendedCalls":
      return "/ventes/appels/funnel";
    case "salesClosed":
      return stage.source === "sales" ? "/ventes/suivi" : "/ventes/appels/funnel";
  }
}

function gainLabel(t: ReturnType<typeof useTranslations>, gain: number | null, locale: string): string {
  const formatted = gain === null ? null : formatEur(gain, locale).replace(/\s+(?=€)/u, "");
  return formatted === null ? "—" : `+${formatted}${t("bottleneckFunnel.perMonth")}`;
}

function rateLabel(rate: number | null, locale: string): string {
  return rate === null ? "—" : formatPercent(rate, locale);
}

function clampPercent(rate: number | null): number {
  if (rate === null) return 0;
  return Math.min(100, Math.max(0, rate * 100));
}

function buildChatContext(stage: BottleneckStage, label: string): ChatContext {
  const isContentStage = stage.source === "content" || stage.id === "views" || stage.id === "clicks" || stage.id === "retention";
  if (isContentStage) {
    return {
      topicType: "lever",
      topicKey: "content",
      topicLabel: label,
      sourcePage: "dashboard_bottleneck",
    };
  }
  // Pipeline closing is a dashboard-only diagnostic stage. It is not one of
  // the six metric topics accepted by /api/improve-chat, so opening Falco for
  // it must use the general context instead of sending an invalid key.
  if (stage.source === "pipeline") {
    return {
      topicType: "general",
      topicKey: null,
      topicLabel: label,
      sourcePage: "dashboard_bottleneck",
    };
  }
  if (stage.metricKey) {
    return {
      topicType: "metric",
      topicKey: stage.metricKey,
      topicLabel: label,
      sourcePage: "dashboard_bottleneck",
    };
  }
  return {
    topicType: "general",
    topicKey: null,
    topicLabel: label,
    sourcePage: "dashboard_bottleneck",
  };
}

function FunnelShape({
  stage,
  index,
  t,
  locale,
}: {
  stage: BottleneckStage;
  index: number;
  t: ReturnType<typeof useTranslations>;
  locale: string;
}) {
  return (
    <div className="flex w-full shrink-0 flex-col items-center justify-center lg:w-[210px]">
      <div
        className={`flex h-[76px] w-full items-center justify-center font-bold leading-[1.1] text-xl tabular-nums ${index >= 3 ? "text-text-on-dark" : "text-foreground"}`}
        style={{
          backgroundColor: FUNNEL_SHAPE_COLORS[index],
          clipPath: funnelClipPath(index),
        }}
        aria-hidden="true"
      >
        {stage.volume === null ? "—" : formatNumber(stage.volume, locale)}
      </div>
      <span className="mt-1 text-center text-[11px] font-medium text-muted-foreground">
        {stageUnit(t, stage)}
      </span>
      <span className="sr-only">
        {stage.volume === null ? t("bottleneckFunnel.unavailable") : `${formatNumber(stage.volume, locale)} ${stageUnit(t, stage)}`}
      </span>
    </div>
  );
}

function StageFalcoButton({
  stageId,
  label,
  t,
  onClick,
}: {
  stageId: BottleneckStageId;
  label: string;
  t: ReturnType<typeof useTranslations>;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      className="size-11 shrink-0 p-0"
      data-testid={`bottleneck-stage-details-${stageId}`}
      aria-label={t("bottleneckFunnel.improveFor", { label })}
      title={t("bottleneckFunnel.improveFor", { label })}
      onClick={onClick}
    >
      <span className="flex size-[26px] items-center justify-center rounded-[7px] border border-bottleneck-icon-border text-accent-text">
        <TrendingUp className="size-[13px]" aria-hidden="true" />
      </span>
    </Button>
  );
}

export function BottleneckFunnel({
  data,
}: {
  data: BottleneckFunnelData;
}) {
  const locale = useLocale();
  const t = useTranslations("dashboard");
  const [selectedStageId, setSelectedStageId] = useState<BottleneckStageId | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [chatStageId, setChatStageId] = useState<BottleneckStageId | null>(null);

  const selectedStage = data.stages.find((stage) => stage.id === selectedStageId) ?? null;
  const chatStage = data.stages.find((stage) => stage.id === chatStageId) ?? null;
  const topStage = data.stages.find((stage) => stage.id === data.bottleneckId) ?? null;

  const stageLabels = useMemo(
    () => new Map(data.stages.map((stage) => [stage.id, stageLabel(t, stage)])),
    [data.stages, t]
  );

  const openChat = () => {
    if (!selectedStage) return;
    const label = stageLabels.get(selectedStage.id) ?? "";
    setSelectedStageId(null);
    setChatStageId(selectedStage.id);
    void recordImproveChatOpened(buildChatContext(selectedStage, label));
  };

  const selectedLabel = selectedStage ? stageLabels.get(selectedStage.id) ?? "" : "";
  const chatLabel = chatStage ? stageLabels.get(chatStage.id) ?? "" : "";
  const canImproveSelected = selectedStage !== null;

  return (
    <>
      <section data-testid="bottleneck-funnel" className="relative max-w-[1080px] overflow-hidden" aria-labelledby="bottleneck-funnel-title">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
          <div>
            <h2 id="bottleneck-funnel-title" className="text-[28px] leading-[1.15] font-bold tracking-[-0.02em]">
              {t("bottleneckFunnel.title")}
            </h2>
            <p className="mt-2 max-w-5xl text-[15px] leading-6 text-muted-foreground">
              {t("bottleneckFunnel.subtitle")}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr]">
          <div className="rounded-[var(--radius-card)] border border-border bg-card px-[18px] py-4">
            <p className="text-xs font-bold tracking-[0.04em] text-muted-foreground uppercase">{t("bottleneckFunnel.sales")}</p>
            <p className="mt-1.5 text-2xl leading-none font-bold tracking-[-0.02em] tabular-nums">
              {data.sales === null ? "—" : formatNumber(data.sales, locale)}
            </p>
          </div>
          <div className="rounded-[var(--radius-card)] border border-border bg-card px-[18px] py-4">
            <p className="text-xs font-bold tracking-[0.04em] text-muted-foreground uppercase">{t("bottleneckFunnel.revenue")}</p>
            <p className="mt-1.5 text-2xl leading-none font-bold tracking-[-0.02em] tabular-nums">
              {data.revenue === null ? "—" : formatEur(data.revenue, locale)}
            </p>
          </div>
          <div className="flex min-h-[88px] flex-col justify-between rounded-[var(--radius-card)] bg-surface-dark px-[18px] py-4 text-text-on-dark">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.04em] text-text-on-dark-muted uppercase">
              <Zap className="size-4 text-accent" aria-hidden="true" />
              {t("bottleneckFunnel.largest")}
            </div>
            <p className="mt-1 max-w-xl text-base leading-5 font-semibold">
              {topStage ? (
                <>
                  {stageLabels.get(topStage.id)}
                  {topStage.monthlyGain !== null && (
                    <span className="text-bottleneck-highlight"> — {t("bottleneckFunnel.upTo")} {gainLabel(t, topStage.monthlyGain, locale)}</span>
                  )}
                </>
              ) : (
                t("bottleneckFunnel.noBottleneck")
              )}
            </p>
          </div>
        </div>

        <div className="mt-7">
          <ol aria-label={t("bottleneckFunnel.funnelLabel")}>
            {data.stages.map((stage, index) => {
              const label = stageLabels.get(stage.id) ?? "";
              const currentPercent = clampPercent(stage.currentRate);
              const benchmarkPercent = clampPercent(stage.benchmarkRate);
              const hasRate = stage.currentRate !== null && stage.benchmarkRate !== null;
              const falcoButton = (
                <StageFalcoButton
                  stageId={stage.id}
                  label={label}
                  t={t}
                  onClick={() => setSelectedStageId(stage.id)}
                />
              );

              return (
                <li
                  key={stage.id}
                  className="flex flex-col items-center gap-4 py-[7px] motion-safe:animate-rise motion-reduce:animate-none lg:flex-row lg:items-center lg:gap-6"
                  style={{ animationDelay: `${index * 45}ms` }}
                >
                  <Link
                    href={stageSourceHref(stage)}
                    aria-label={t("bottleneckFunnel.detailFor", { label })}
                    title={t("bottleneckFunnel.detailFor", { label })}
                    className="group flex w-full min-w-0 flex-1 flex-col items-center gap-4 rounded-[var(--radius-control)] p-1 outline-none transition-colors duration-[var(--motion-fast)] hover:bg-surface-sunken focus-visible:ring-3 focus-visible:ring-accent/20 motion-reduce:transition-none lg:flex-row lg:items-center lg:gap-6"
                  >
                    <FunnelShape stage={stage} index={index} t={t} locale={locale} />

                    <div className="min-w-0 flex-1 self-stretch lg:self-auto">
                      <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-xs font-bold text-muted-foreground tabular-nums">{index + 1}</span>
                        <span className="inline-flex items-center gap-1 text-[15px] leading-5 font-semibold tracking-[-0.005em] group-hover:text-accent-text group-hover:underline group-hover:underline-offset-4">
                          {label}
                          <ArrowRight className="size-3.5 opacity-60 transition-transform duration-[var(--motion-fast)] group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                        </span>
                        {data.bottleneckId === stage.id && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-[9px] py-[3px] text-[11px] leading-none font-bold tracking-[0.02em] text-primary-foreground uppercase">
                            <Zap className="size-3" aria-hidden="true" />
                            {t("bottleneckFunnel.principal")}
                          </span>
                        )}
                      </div>

                      {index === 0 ? (
                        <p className="text-[12.5px] text-muted-foreground">{t("bottleneckFunnel.startingPoint")}</p>
                      ) : (
                        <>
                          <div
                            className="relative h-2 max-w-[480px] overflow-visible rounded-full bg-muted"
                            role={hasRate ? "meter" : "img"}
                            aria-label={hasRate ? `${label}: ${rateLabel(stage.currentRate, locale)}` : `${label}: ${t("bottleneckFunnel.unavailable")}`}
                            aria-valuemin={hasRate ? 0 : undefined}
                            aria-valuemax={hasRate ? 100 : undefined}
                            aria-valuenow={hasRate ? currentPercent : undefined}
                          >
                            {hasRate && (
                              <div
                                className="h-full rounded-full bg-accent transition-[width] duration-[var(--motion-slow)] ease-[var(--ease-out)] motion-reduce:transition-none"
                                style={{ width: `${currentPercent}%` }}
                              />
                            )}
                            {hasRate && (
                              <span
                                className="absolute top-1/2 block h-10 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface-dark"
                                style={{ left: `${benchmarkPercent}%` }}
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-[18px] gap-y-2 text-[12.5px] leading-5">
                            <span className="font-bold text-accent-text">
                              {t("bottleneckFunnel.you")}: {rateLabel(stage.currentRate, locale)}
                            </span>
                            <span className="text-muted-foreground">
                              {t("bottleneckFunnel.benchmark")}: {rateLabel(stage.benchmarkRate, locale)}
                            </span>
                            <span className="text-muted-foreground">
                              {t("bottleneckFunnel.gap")}: {hasRate ? formatSignedPercent((stage.currentRate! - stage.benchmarkRate!) * 100, locale) : "—"}
                            </span>
                            <span className="ml-auto font-bold text-accent-text tabular-nums">
                              {gainLabel(t, stage.monthlyGain, locale)}
                            </span>
                          </div>
                          {stage.noteKey && <p className="mt-2 text-xs text-muted-foreground">{t(`bottleneckFunnel.${stage.noteKey}`)}</p>}
                        </>
                      )}
                    </div>
                  </Link>
                  <div className="self-end lg:self-auto">{falcoButton}</div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-5 flex flex-col gap-4 rounded-[var(--radius-card)] bg-surface-dark px-5 py-5 text-text-on-dark sm:flex-row sm:items-center sm:justify-between sm:px-[26px]">
          <p className="max-w-3xl text-base leading-6 font-semibold">
            {t("bottleneckFunnel.summaryTotal")}: <span className="text-bottleneck-highlight">{data.totalPotential === null ? "—" : gainLabel(t, data.totalPotential, locale)}</span>
          </p>
          <Button type="button" size="lg" className="px-[18px] text-[13.5px]" data-testid="bottleneck-summary-button" onClick={() => setSummaryOpen(true)}>
            {t("bottleneckFunnel.viewSummary")}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
        <p className="mt-3 text-[12.5px] leading-5 text-muted-foreground">{t("bottleneckFunnel.summaryNote")}</p>
      </section>

      <Dialog open={selectedStageId !== null} onOpenChange={(open) => !open && setSelectedStageId(null)}>
        <DialogContent className="max-w-[420px] p-7" data-testid="bottleneck-stage-dialog" aria-describedby="bottleneck-stage-description">
          {selectedStage && (
            <>
              <p className="text-xs font-bold tracking-[0.08em] text-accent-text uppercase">{t("bottleneckFunnel.dialogEyebrow")}</p>
              <div className="mt-4 flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-accent-soft">
                  <Falco pose="alert" size="sm" animate="enter" alt="Falco" />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-[17px] font-semibold">{selectedLabel}</DialogTitle>
                  <p id="bottleneck-stage-description" className="mt-2 text-sm leading-6 text-muted-foreground">
                    {selectedStage.currentRate !== null && selectedStage.benchmarkRate !== null
                      ? t("bottleneckFunnel.dialogDescription", {
                          current: rateLabel(selectedStage.currentRate, locale),
                          benchmark: rateLabel(selectedStage.benchmarkRate, locale),
                          gain: selectedStage.monthlyGain === null ? t("bottleneckFunnel.gainUnavailableShort") : gainLabel(t, selectedStage.monthlyGain, locale),
                        })
                      : t("bottleneckFunnel.dialogUnavailable")}
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
                {canImproveSelected && (
                  <Button type="button" onClick={openChat}>
                    {t("bottleneckFunnel.improve")}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                )}
                <DialogClose asChild>
                  <Button type="button" variant="outline">{t("bottleneckFunnel.close")}</Button>
                </DialogClose>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-w-[480px] p-7" data-testid="bottleneck-summary-dialog" aria-describedby="bottleneck-summary-description">
          <DialogTitle className="text-lg font-bold">{t("bottleneckFunnel.summaryTitle")}</DialogTitle>
          <p id="bottleneck-summary-description" className="mt-2 text-sm leading-6 text-muted-foreground">{t("bottleneckFunnel.summaryDescription")}</p>
          <div className="mt-5 divide-y divide-border rounded-[var(--radius-control)] border border-border">
            {data.stages.slice(1).filter((stage) => stage.currentRate !== null && stage.benchmarkRate !== null).map((stage) => (
              <div key={stage.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{stageLabels.get(stage.id)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("bottleneckFunnel.you")}: {rateLabel(stage.currentRate, locale)} · {t("bottleneckFunnel.benchmark")}: {rateLabel(stage.benchmarkRate, locale)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold text-accent-text">{gainLabel(t, stage.monthlyGain, locale)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-[var(--radius-control)] bg-surface-dark px-4 py-4 text-text-on-dark">
            <span className="text-sm font-bold">{t("bottleneckFunnel.summaryTotalLabel")}</span>
            <span className="font-bold text-bottleneck-highlight">{data.totalPotential === null ? "—" : gainLabel(t, data.totalPotential, locale)}</span>
          </div>
          <div className="mt-6">
            <DialogClose asChild>
              <Button type="button" variant="outline" className="w-full">{t("bottleneckFunnel.close")}</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>

      <Drawer open={chatStageId !== null} onOpenChange={(open) => !open && setChatStageId(null)}>
        <DrawerContent>
          {chatStage && (
            <LazyImproveChat
              context={buildChatContext(chatStage, chatLabel)}
              period="3-months"
              gapBadge={
                chatStage.currentRate !== null && chatStage.benchmarkRate !== null
                  ? `${t("bottleneckFunnel.you")}: ${rateLabel(chatStage.currentRate, locale)} · ${t("bottleneckFunnel.benchmark")}: ${rateLabel(chatStage.benchmarkRate, locale)}`
                  : null
              }
              seedQuestion={t("bottleneckFunnel.seedQuestion", { label: chatLabel })}
            />
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}
