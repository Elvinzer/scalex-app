"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  Handshake,
  ListChecks,
  Loader2,
  PenLine,
  Sparkles,
  Target,
  TrendingUp,
  UsersRound,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Falco } from "@/components/falco/falco";
import { LazyImproveChat } from "@/components/lazy-improve-chat";
import { StreakMomentum } from "@/components/streak/streak-momentum";
import type { ChatContext } from "@/lib/chat-context";
import { formatEur } from "@/lib/currency";
import type { WeeklyReportRow } from "@/lib/dashboard/weekly-report";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";
import type {
  JournalActionCandidate,
} from "@/lib/journal/action-generator";
import type {
  JournalActionLoopData,
  RoadmapActionCategory,
  RoadmapDailyAction,
  RoadmapItem,
  RoadmapStage,
} from "@/lib/journal/action-loop";
import type { StreakSnapshot } from "@/lib/streak/service";
import { cn } from "@/lib/utils";

import {
  completeRoadmapAction,
  recordBottleneckCtaClicked,
  recordRoadmapItemClicked,
  startRoadmapAction,
} from "./actions";

type RoadmapViewProps = {
  data: JournalActionLoopData;
  streak: StreakSnapshot;
  weeklyReports: WeeklyReportRow[];
  fixtureMode?: boolean;
};

const CATEGORY_ICONS: Record<RoadmapActionCategory, LucideIcon> = {
  content: PenLine,
  sales: Handshake,
  team: UsersRound,
};

const STAGE_ICONS: Record<RoadmapStage, LucideIcon> = {
  in_progress: Target,
  upcoming: Circle,
  done: CheckCircle2,
};

function numberLabel(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "en" ? "en-US" : "fr-FR", { maximumFractionDigits: 0 }).format(value);
}

function contentTitle(action: JournalActionCandidate): string {
  return action.title.replace(/^Tourne la vidéo « /, "").replace(/ »$/, "");
}

function leadName(action: JournalActionCandidate): string {
  return action.title.replace(/^Relance\s+/, "");
}

function normalizedText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function metricLabel(action: JournalActionCandidate, translateDiagnostic: (key: string) => string): string {
  if (!action.metricKey) return action.title;
  try {
    return translateDiagnostic(`metrics.${action.metricKey}`);
  } catch {
    return action.title;
  }
}

function actionTitle(
  action: JournalActionCandidate,
  translate: (key: string, values?: Record<string, string | number>) => string,
  translateDiagnostic: (key: string) => string,
): string {
  if (action.type === "bottleneck") return translate("actionTitles.bottleneck", { label: metricLabel(action, translateDiagnostic) });
  if (action.type === "lead_reminder") return translate("actionTitles.followUp", { name: leadName(action) });
  if (action.type === "content") return translate("actionTitles.content", { title: contentTitle(action) });
  if (action.type === "data_checkin") return translate("actionTitles.checkin");
  return action.title;
}

function actionOrigin(
  action: JournalActionCandidate,
  translate: (key: string, values?: Record<string, string | number>) => string,
  translateDiagnostic: (key: string) => string,
): string {
  if (action.type === "bottleneck") return translate("origins.bottleneck", { label: metricLabel(action, translateDiagnostic) });
  if (action.type === "lead_reminder") return translate("origins.pipeline");
  if (action.type === "content") return translate("origins.content");
  const normalizedSource = normalizedText(action.sourceInsight);
  if (normalizedSource.includes("delivrabilite")) return translate("origins.delivery");
  if (normalizedSource.includes("vente")) return translate("origins.sales");
  return translate("origins.organization");
}

function impactLabel(
  action: JournalActionCandidate,
  translate: (key: string, values?: Record<string, string | number>) => string,
  locale: string,
): string {
  if (!action.impact) return translate("impact.toAssess");
  if (action.impact.unit === "eur_month") {
    return translate("impact.monthly", { amount: formatEur(action.impact.value, locale === "en" ? "en-US" : "fr-FR") });
  }
  if (action.impact.unit === "clients_month") return translate("impact.clients", { amount: numberLabel(action.impact.value, locale) });
  return translate("impact.views", { amount: numberLabel(action.impact.value, locale) });
}

function itemTitle(
  item: RoadmapItem,
  translate: (key: string, values?: Record<string, string | number>) => string,
  translateDiagnostic: (key: string) => string,
): string {
  if (item.type === "bottleneck") {
    return translate("actionTitles.bottleneck", {
      label: translateDiagnostic(`metrics.${item.sourceId}`),
    });
  }
  if (item.type === "content") {
    if (item.contentKind === "email") return translate("journey.emailTitle");
    return item.title ? translate("journey.contentTitle", { title: item.title }) : translate("journey.genericContentTitle");
  }
  return item.title;
}

function itemDescription(
  item: RoadmapItem,
  translate: (key: string, values?: Record<string, string | number>) => string,
  translateDiagnostic: (key: string) => string,
): string {
  if (item.type === "bottleneck") {
    return translate("origins.bottleneck", { label: translateDiagnostic(`metrics.${item.sourceId}`) });
  }
  if (item.type === "content") {
    return item.staleDays === null ? translate("journey.noActivity") : translate("journey.stale", { days: item.staleDays ?? 0 });
  }
  return translate("journey.leverSource");
}

function Delta({ direction, label }: { direction: "up" | "down" | null; label: string | null }) {
  if (!label) return null;
  return (
    <span
      className={cn(
        "text-[11px] font-bold",
        direction === "up" && "text-state-healthy",
        direction === "down" && "text-state-critical",
        direction === null && "text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function CategoryIcon({ category }: { category: RoadmapActionCategory }) {
  const Icon = CATEGORY_ICONS[category];
  return <Icon className="size-4" aria-hidden="true" />;
}

function DailyActionRow({
  item,
  completed,
  pending,
  onStart,
  onComplete,
  translate,
  translateDiagnostic,
  locale,
}: {
  item: RoadmapDailyAction;
  completed: boolean;
  pending: boolean;
  onStart: (action: JournalActionCandidate) => void;
  onComplete: (item: RoadmapDailyAction) => void;
  translate: (key: string, values?: Record<string, string | number>) => string;
  translateDiagnostic: (key: string) => string;
  locale: string;
}) {
  const action = item.action;
  const categoryLabel = translate(`categories.${item.labelKey}`);
  const title = action
    ? actionTitle(action, translate, translateDiagnostic)
    : translate(`fallback.${item.labelKey}.title`);
  const origin = action
    ? actionOrigin(action, translate, translateDiagnostic)
    : translate(`fallback.${item.labelKey}.body`);
  const impact = action ? impactLabel(action, translate, locale) : null;
  const isOverdue = Boolean(action?.overdue);

  return (
    <article className={cn("flex min-w-0 flex-col gap-3 p-3 sm:p-4", completed && "bg-surface-sunken/60")}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={completed}
          aria-label={completed ? translate("actions.markedDone") : translate("actions.markDone", { title })}
          disabled={!action || completed || pending}
          onClick={() => onComplete(item)}
          className={cn(
            "mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            completed
              ? "border-state-healthy bg-state-healthy text-text-on-dark"
              : action
                ? "border-border bg-card text-transparent hover:border-accent hover:text-accent"
                : "border-border bg-surface-sunken text-transparent",
          )}
        >
          {completed ? <Check className="size-4" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-2-soft px-2 py-1 text-[11px] font-bold text-accent-2-text">
              <CategoryIcon category={item.category} />
              {categoryLabel}
            </span>
            {isOverdue && <span className="text-[11px] font-semibold text-state-caution">{translate("deferred")}</span>}
          </div>
          <h3 className={cn("mt-2 text-sm font-bold leading-5", completed && "text-muted-foreground line-through")}>{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{origin}</p>
          {impact && <p className="mt-1 text-xs font-semibold text-foreground">{impact}</p>}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pl-14">
        {action ? (
          <>
            <Button type="button" size="sm" variant="outline" className="min-h-10 px-2.5 text-xs" disabled={pending || completed} onClick={() => onStart(action)}>
              {pending ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles className="size-3.5 text-accent-2" aria-hidden="true" />}
              {translate("actions.withFalco")}
            </Button>
            <Button type="button" size="sm" variant="secondary" className="min-h-10 px-2.5 text-xs" disabled={pending || completed} onClick={() => onComplete(item)}>
              {pending ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {completed ? translate("actions.completed") : translate("actions.done")}
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" className="min-h-10 px-2.5 text-xs" asChild>
            <Link href="/diagnostic">
              {translate("fallback.openDiagnostic")}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}

function BottleneckBlock({
  data,
  pending,
  onStart,
  translate,
  translateDiagnostic,
  locale,
}: {
  data: JournalActionLoopData;
  pending: boolean;
  onStart: () => void;
  translate: (key: string, values?: Record<string, string | number>) => string;
  translateDiagnostic: (key: string) => string;
  locale: string;
}) {
  const bottleneck = data.bottleneck;
  const label = bottleneck ? translateDiagnostic(`metrics.${bottleneck.key}`) : "";

  return (
    <section className="sticker-spotlight overflow-hidden p-5 sm:p-6" aria-labelledby="roadmap-bottleneck-title">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-bold tracking-[0.12em] text-text-on-dark-muted uppercase">
            <TrendingUp className="size-4 text-accent" aria-hidden="true" />
            {translate("bottleneck.eyebrow")}
          </div>
          <h2 id="roadmap-bottleneck-title" className="mt-2 text-lg font-bold leading-6 text-text-on-dark">
            {bottleneck ? translate("bottleneck.title", { label }) : translate("bottleneck.emptyTitle")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-on-dark-muted">
            {bottleneck
              ? translate("bottleneck.explanation", {
                  current: bottleneck.currentRatePercent,
                  benchmark: bottleneck.benchmarkRatePercent,
                  label,
                })
              : translate("bottleneck.emptyBody")}
          </p>
        </div>
        <Falco pose={bottleneck ? "alert" : "neutral"} size="sm" alt="Falco" className="hidden sm:block" />
      </div>

      {bottleneck ? (
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-border/30 pt-4">
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-text-on-dark-muted">
            <span>
              {translate("bottleneck.current")} <strong className="text-text-on-dark">{bottleneck.currentRatePercent}%</strong>
            </span>
            <span>
              {translate("bottleneck.benchmark")} <strong className="text-text-on-dark">{bottleneck.benchmarkRatePercent}%</strong>
            </span>
            <span>
              {translate("bottleneck.opportunity")} <strong className="text-accent">{bottleneck.monthlyGain === null ? "—" : `+${formatEur(bottleneck.monthlyGain, locale === "en" ? "en-US" : "fr-FR")}`}</strong>
            </span>
          </div>
          <Button type="button" variant="default" className="min-h-11" disabled={pending} onClick={onStart}>
            {pending ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
            {translate("bottleneck.cta")}
          </Button>
        </div>
      ) : (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/30 pt-4">
          <span className="text-xs text-text-on-dark-muted">{translate("bottleneck.emptyAction")}</span>
          <Button type="button" variant="outline" className="min-h-11" asChild>
            <Link href="/diagnostic">
              {translate("bottleneck.openDiagnostic")}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function RoadmapJourney({
  items,
  translate,
  translateDiagnostic,
  locale,
}: {
  items: RoadmapItem[];
  translate: (key: string, values?: Record<string, string | number>) => string;
  translateDiagnostic: (key: string) => string;
  locale: string;
}) {
  const stages: RoadmapStage[] = ["upcoming", "in_progress", "done"];
  const visibleStages = stages.filter((stage) => items.some((item) => item.stage === stage));

  return (
    <section aria-labelledby="roadmap-journey-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent-2 uppercase">{translate("journey.eyebrow")}</p>
          <h2 id="roadmap-journey-title" className="mt-1 text-lg font-bold">{translate("journey.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{translate("journey.subtitle")}</p>
        </div>
        <ListChecks className="size-5 text-accent-2" aria-hidden="true" />
      </div>

      <div className={cn("mt-4 grid gap-3", visibleStages.length === 1 ? "md:grid-cols-1" : visibleStages.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3")}>
        {visibleStages.map((stage) => {
          const Icon = STAGE_ICONS[stage];
          const stageItems = items.filter((item) => item.stage === stage);
          return (
            <div key={stage} className="sticker-card min-w-0 p-4">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Icon className={cn("size-4", stage === "done" ? "text-state-healthy" : "text-accent-2")} aria-hidden="true" />
                <h3 className="text-sm font-bold">{translate(`journey.${stage}`)}</h3>
                <span className="ml-auto text-xs font-bold tabular-nums text-muted-foreground">{stageItems.length}</span>
              </div>
              {stageItems.length > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  {stageItems.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => void recordRoadmapItemClicked(item.stage)}
                      className="group rounded-[var(--radius-control)] border border-border bg-card p-3 transition-colors duration-200 hover:border-border-hover hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-bold leading-5">{itemTitle(item, translate, translateDiagnostic)}</p>
                        <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
                      </div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">{itemDescription(item, translate, translateDiagnostic)}</p>
                      {item.impactAmountEur !== null && (
                        <p className="mt-2 text-xs font-bold tabular-nums text-accent-text">
                          {translate("journey.monthlyImpact", { amount: formatEur(item.impactAmountEur, locale === "en" ? "en-US" : "fr-FR") })}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <div className={cn("h-full rounded-full transition-[width] duration-300", stage === "done" ? "bg-state-healthy" : "bg-accent-2")} style={{ width: `${item.progress}%` }} />
                        </div>
                        <span className="text-[11px] font-bold tabular-nums text-muted-foreground">{item.progress}%</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-xs leading-5 text-muted-foreground">{translate("journey.empty")}</p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WeeklySummary({
  reports,
  actionsDone,
  checkInDone,
  translate,
  locale,
}: {
  reports: WeeklyReportRow[];
  actionsDone: number;
  checkInDone: boolean;
  translate: (key: string, values?: Record<string, string | number>) => string;
  locale: string;
}) {
  const report = reports[0] ?? null;
  const reportStats = report?.statsSnapshot.slice(0, 4) ?? [];

  return (
    <section className="sticker-card p-4 sm:p-5" aria-labelledby="roadmap-weekly-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">{translate("weekly.eyebrow")}</p>
          <h2 id="roadmap-weekly-title" className="mt-1 text-lg font-bold">{translate("weekly.title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{translate("weekly.subtitle")}</p>
        </div>
        <TrendingUp className="size-5 text-accent-2" aria-hidden="true" />
      </div>

      {report ? (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {reportStats.map((stat) => (
            <div key={stat.key} className="rounded-[var(--radius-control)] bg-surface-sunken p-3">
              <p className="text-[11px] font-bold text-muted-foreground">{translate(`weekly.stats.${stat.key}`)}</p>
              <p className="mt-1 text-base font-bold tabular-nums">{stat.valueLabel}</p>
              <Delta direction={stat.deltaDirection} label={stat.deltaLabel} />
            </div>
          ))}
          <div className="rounded-[var(--radius-control)] bg-surface-sunken p-3">
            <p className="text-[11px] font-bold text-muted-foreground">Scale Score</p>
            <p className="mt-1 text-base font-bold tabular-nums">{report.score === null ? "—" : `${report.score}/100`}</p>
            <Delta direction={report.scoreDelta === null ? null : report.scoreDelta > 0 ? "up" : report.scoreDelta < 0 ? "down" : null} label={report.scoreDelta === null ? null : `${report.scoreDelta > 0 ? "+" : ""}${report.scoreDelta}`} />
          </div>
          <div className="rounded-[var(--radius-control)] bg-surface-sunken p-3">
            <p className="text-[11px] font-bold text-muted-foreground">{translate("weekly.actionsDone")}</p>
            <p className="mt-1 text-base font-bold tabular-nums">{numberLabel(actionsDone, locale)}</p>
            <span className="text-[11px] text-muted-foreground">{translate("weekly.thisWeek")}</span>
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-[var(--radius-control)] bg-surface-sunken px-3 py-4 text-sm text-muted-foreground">{translate("weekly.empty")}</div>
      )}

      {!checkInDone && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] bg-accent-2-soft px-3 py-3">
          <p className="text-sm font-semibold text-accent-2-text">{translate("weekly.checkinReminder")}</p>
          <Button size="sm" variant="outline" className="min-h-11" asChild>
            <Link href="/datas">{translate("weekly.openData")}</Link>
          </Button>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button type="button" variant="link" asChild>
          <Link href="/dashboard?report=1" prefetch>
            {translate("weekly.fullReport")}
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

export function RoadmapView({ data, streak, weeklyReports, fixtureMode = false }: RoadmapViewProps) {
  const locale = useLocale();
  const translate = useTranslations("roadmap");
  const translateDiagnostic = useTranslations("diagnostic");
  const [showIntro, setShowIntro] = useState(false);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setShowIntro(window.localStorage.getItem("scalex:roadmap-intro-dismissed") !== "1");
  }, []);

  function dismissIntro() {
    window.localStorage.setItem("scalex:roadmap-intro-dismissed", "1");
    setShowIntro(false);
  }

  function startAction(action: JournalActionCandidate, category: RoadmapActionCategory = "sales") {
    setError(null);
    if (action.type === "data_checkin") return;
    if (fixtureMode) {
      setChatContext(action.chatContext);
      return;
    }
    setPendingId(action.id);
    startTransition(async () => {
      const result = await startRoadmapAction({ category, type: action.type, sourceId: action.sourceId });
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setChatContext(action.chatContext);
      void recordImproveChatOpened(action.chatContext);
    });
  }

  function completeAction(item: RoadmapDailyAction) {
    const action = item.action;
    if (!action || completedIds.has(action.id)) return;
    setError(null);
    if (action.type === "data_checkin") return;
    if (fixtureMode) {
      setCompletedIds((current) => new Set(current).add(action.id));
      return;
    }
    setPendingId(action.id);
    startTransition(async () => {
      const result = await completeRoadmapAction({ category: item.category, type: action.type, sourceId: action.sourceId });
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setCompletedIds((current) => new Set(current).add(action.id));
    });
  }

  function startBottleneck() {
    const bottleneck = data.bottleneck;
    if (!bottleneck) return;
    setError(null);
    if (fixtureMode) {
      setChatContext(bottleneck.chatContext);
      return;
    }
    setPendingId(`bottleneck:${bottleneck.key}`);
    startTransition(async () => {
      void recordBottleneckCtaClicked(bottleneck.key);
      const result = await startRoadmapAction({ category: "sales", type: "bottleneck", sourceId: bottleneck.key });
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setChatContext(bottleneck.chatContext);
      void recordImproveChatOpened(bottleneck.chatContext);
    });
  }

  return (
    <div className="flex flex-col gap-6 pb-8" data-testid="roadmap-page">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.14em] text-accent-text uppercase">{translate("eyebrow")}</p>
            <h1 className="mt-1 text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{translate("title")}</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{translate("subtitle")}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground">
            <span className="size-2 rounded-full bg-state-healthy" aria-hidden="true" />
            {translate("active")}
          </span>
        </div>
      </header>

      {showIntro && (
        <aside className="flex items-start gap-3 rounded-[var(--radius-card)] border border-accent-2-border bg-accent-2-soft/60 px-4 py-3" role="note">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-2" aria-hidden="true" />
          <p className="flex-1 text-sm leading-6">
            <span className="font-bold">{translate("intro.label")}</span> {translate("intro.body")}
          </p>
          <button type="button" onClick={dismissIntro} aria-label={translate("intro.dismiss")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-card">
            <X className="size-4" aria-hidden="true" />
          </button>
        </aside>
      )}

      <StreakMomentum snapshot={streak} />

      <section aria-labelledby="roadmap-actions-title">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-accent-2 uppercase">{translate("daily.eyebrow")}</p>
            <h2 id="roadmap-actions-title" className="mt-1 text-lg font-bold">{translate("daily.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{translate("daily.subtitle")}</p>
          </div>
          <ListChecks className="size-5 text-accent-2" aria-hidden="true" />
        </div>

        <div className="sticker-card mt-4 grid overflow-hidden divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
          {data.dailyActions.map((item) => (
            <DailyActionRow
              key={item.category}
              item={item}
              completed={Boolean(item.action && (item.action.status === "done" || completedIds.has(item.action.id)))}
              pending={isPending && pendingId === item.action?.id}
              onStart={(action) => startAction(action, item.category)}
              onComplete={completeAction}
              translate={translate}
              translateDiagnostic={translateDiagnostic}
              locale={locale}
            />
          ))}
        </div>
      </section>

      {error && (
        <p className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-sm text-state-critical" role="alert">
          <CircleAlert className="size-4" aria-hidden="true" />
          {error}
        </p>
      )}

      <BottleneckBlock
        data={data}
        pending={isPending && pendingId === `bottleneck:${data.bottleneck?.key}`}
        onStart={startBottleneck}
        translate={translate}
        translateDiagnostic={translateDiagnostic}
        locale={locale}
      />

      {data.roadmapVisible && <RoadmapJourney items={data.roadmapItems} translate={translate} translateDiagnostic={translateDiagnostic} locale={locale} />}

      <WeeklySummary reports={weeklyReports} actionsDone={data.momentum.actionsDoneThisWeek} checkInDone={data.checkInDoneThisWeek} translate={translate} locale={locale} />

      <Drawer open={chatContext !== null} onOpenChange={(open) => { if (!open) setChatContext(null); }}>
        <DrawerContent>
          {chatContext && <LazyImproveChat context={chatContext} period="3-months" gapBadge={null} />}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
