"use client";

import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import {
  ArrowRight,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  CircleAlert,
  GripVertical,
  ListChecks,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Falco } from "@/components/falco/falco";
import { FalcoDrawer } from "@/components/falco/falco-drawer";
import { LazyImproveChat } from "@/components/lazy-improve-chat";
import { Button } from "@/components/ui/button";
import { DrawerContent } from "@/components/ui/drawer";
import { StreakMomentum } from "@/components/streak/streak-momentum";
import type { ChatContext } from "@/lib/chat-context";
import { formatEur } from "@/lib/currency";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";
import { JournalCalendar, type JournalCalendarEvent } from "@/app/(app)/journal/journal-calendar";
import { TodoPanel } from "@/app/(app)/journal/todo-panel";
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
import type { CallRoadmapRecommendation } from "@/lib/closing-videos/types";
import type { JournalDay } from "@/lib/journal/queries";
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
  callRoadmapRecommendations?: CallRoadmapRecommendation[];
  accountId?: string;
  fixtureMode?: boolean;
  todos?: RoadmapTodo[];
  projects?: RoadmapProject[];
  journalDays?: JournalDay[];
  calendarYear?: number;
  calendarMonth?: number;
  todayIso?: string;
};

export type RoadmapTodo = {
  id: string;
  label: string;
  dueDate: string | null;
  done: boolean;
  projectId: string | null;
  isBusinessImprovement: boolean;
};

export type RoadmapProject = {
  id: string;
  name: string;
};

const STAGE_ICONS: Record<RoadmapStage, LucideIcon> = {
  in_progress: Target,
  upcoming: Circle,
  done: CheckCircle2,
};

function isRoadmapStage(value: unknown): value is RoadmapStage {
  return value === "upcoming" || value === "in_progress" || value === "done";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
  if (action.type === "lever") {
    try {
      return translate(`actionTitles.levers.${action.sourceId}`);
    } catch {
      return translate("actionTitles.leverFallback");
    }
  }
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

function itemElementTitle(
  item: RoadmapItem,
  translate: (key: string, values?: Record<string, string | number>) => string,
  translateDiagnostic: (key: string) => string,
): string {
  if (item.type === "bottleneck") {
    return translateDiagnostic(`metrics.${item.sourceId}`);
  }
  if (item.type === "content") {
    if (item.contentKind === "email") return translate("journey.emailElement");
    return item.title || translate("journey.genericContentElement");
  }
  try {
    return translate(`journey.leverTitles.${item.sourceId}`);
  } catch {
    return item.description || item.title;
  }
}

function itemActionLabel(
  item: RoadmapItem,
  translate: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (item.type === "bottleneck") {
    return translate("journey.bottleneckAction");
  }
  if (item.type === "content") {
    return translate(item.contentKind === "email" ? "journey.emailAction" : "journey.contentAction");
  }
  try {
    return translate(`journey.leverActions.${item.sourceId}`);
  } catch {
    return translate("journey.leverActionFallback", { label: item.description || item.title });
  }
}

function itemContextLabel(
  item: RoadmapItem,
  translate: (key: string, values?: Record<string, string | number>) => string,
): string | null {
  if (item.type !== "content" || item.staleDays === undefined) return null;
  if (item.staleDays === null) return translate("journey.noActivity");
  return translate("journey.stale", { days: item.staleDays });
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
            <Link href="/diagnostic-app">
              {translate("bottleneck.openDiagnostic")}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

function RoadmapCard({
  item,
  stage,
  translate,
  translateDiagnostic,
  locale,
  isOverlay = false,
}: {
  item: RoadmapItem;
  stage: RoadmapStage;
  translate: (key: string, values?: Record<string, string | number>) => string;
  translateDiagnostic: (key: string) => string;
  locale: string;
  isOverlay?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { stage },
    attributes: {
      role: "link",
      roleDescription: translate("journey.dragRole"),
    },
  });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;
  const title = itemElementTitle(item, translate, translateDiagnostic);
  const actionLabel = itemActionLabel(item, translate);
  const contextLabel = itemContextLabel(item, translate);
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-sm font-bold leading-5">{title}</p>
        <div className="flex shrink-0 items-center gap-1">
          <GripVertical className="size-4 text-muted-foreground" aria-hidden="true" />
          <ArrowRight className="mt-0.5 size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-1 text-xs font-medium leading-5 text-muted-foreground">{actionLabel}</p>
      {contextLabel && <p className="mt-1 text-[11px] leading-4 text-muted-foreground">{contextLabel}</p>}
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
    </>
  );

  if (isOverlay) {
    return (
      <div className="sticker-card w-[min(22rem,calc(100vw-2rem))] cursor-grabbing p-3 shadow-[var(--shadow-card-hover)]">
        {content}
      </div>
    );
  }

  return (
    <Link
      ref={setNodeRef}
      href={item.href}
      style={style}
      {...listeners}
      {...attributes}
      title={translate("journey.dragHint")}
      data-testid={`roadmap-item-${item.id}`}
      onClick={() => void recordRoadmapItemClicked(stage)}
      className={cn(
        "group block cursor-grab rounded-[var(--radius-control)] border border-border bg-card p-3 outline-none transition-colors duration-200 hover:border-border-hover hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:cursor-grabbing",
        isDragging && "invisible",
      )}
    >
      {content}
    </Link>
  );
}

function RoadmapColumn({
  stage,
  items,
  translate,
  translateDiagnostic,
  locale,
}: {
  stage: RoadmapStage;
  items: RoadmapItem[];
  translate: (key: string, values?: Record<string, string | number>) => string;
  translateDiagnostic: (key: string) => string;
  locale: string;
}) {
  const Icon = STAGE_ICONS[stage];
  const { setNodeRef, isOver } = useDroppable({ id: stage });

  return (
    <div
      ref={setNodeRef}
      data-testid={`roadmap-column-${stage}`}
      className={cn(
        "sticker-card flex min-h-44 min-w-0 flex-col overflow-hidden p-0 transition-colors duration-200",
        isOver && "border-accent-2-border bg-accent-2-soft/40",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-surface-sunken/60 px-4 py-3">
        <Icon className={cn("size-4", stage === "done" ? "text-state-healthy" : "text-accent-2")} aria-hidden="true" />
        <h3 className="text-sm font-bold">{translate(`journey.${stage}`)}</h3>
        <span className="ml-auto text-xs font-bold tabular-nums text-muted-foreground">{items.length}</span>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-1 flex-col gap-2 p-3">
          {items.map((item) => (
            <RoadmapCard
              key={item.id}
              item={item}
              stage={stage}
              translate={translate}
              translateDiagnostic={translateDiagnostic}
              locale={locale}
            />
          ))}
        </div>
      ) : (
        <p className="flex min-h-28 flex-1 items-center justify-center px-4 py-6 text-center text-xs leading-5 text-muted-foreground">{translate("journey.empty")}</p>
      )}
    </div>
  );
}

function RoadmapJourney({
  items,
  translate,
  translateDiagnostic,
  locale,
  storageKey,
}: {
  items: RoadmapItem[];
  translate: (key: string, values?: Record<string, string | number>) => string;
  translateDiagnostic: (key: string) => string;
  locale: string;
  storageKey: string | null;
}) {
  const stages: RoadmapStage[] = ["upcoming", "in_progress", "done"];
  const itemKey = items.map((item) => item.id).join("|");
  const [stageOverrides, setStageOverrides] = useState<Record<string, RoadmapStage>>({});
  const [hydratedStorageKey, setHydratedStorageKey] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  );

  useEffect(() => {
    setHydratedStorageKey(null);
    if (!storageKey) {
      setStageOverrides({});
      setHydratedStorageKey("memory");
      return;
    }

    const validIds = new Set(itemKey ? itemKey.split("|") : []);
    const nextOverrides: Record<string, RoadmapStage> = {};
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isRecord(parsed)) {
          for (const [id, value] of Object.entries(parsed)) {
            if (validIds.has(id) && isRoadmapStage(value)) nextOverrides[id] = value;
          }
        }
      }
    } catch {
      // A blocked or malformed browser storage should not prevent the
      // roadmap from remaining interactive in memory.
    }
    setStageOverrides(nextOverrides);
    setHydratedStorageKey(storageKey);
  }, [itemKey, storageKey]);

  useEffect(() => {
    if (!storageKey || hydratedStorageKey !== storageKey) return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(stageOverrides));
    } catch {
      // Storage is an enhancement; drag-and-drop remains usable in memory.
    }
  }, [hydratedStorageKey, stageOverrides, storageKey]);

  const resolvedItems = items.map((item) => ({
    ...item,
    stage: stageOverrides[item.id] ?? item.stage,
  }));
  const activeItem = activeId ? resolvedItems.find((item) => item.id === activeId) ?? null : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (!event.over) return;

    const itemId = String(event.active.id);
    const targetStageId = String(event.over.id);
    if (!isRoadmapStage(targetStageId)) return;

    const item = resolvedItems.find((candidate) => candidate.id === itemId);
    if (!item || item.stage === targetStageId) return;

    const originalItem = items.find((candidate) => candidate.id === itemId);
    setStageOverrides((current) => {
      const next = { ...current };
      if (originalItem?.stage === targetStageId) delete next[itemId];
      else next[itemId] = targetStageId;
      return next;
    });
  }

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

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragCancel={handleDragCancel} onDragEnd={handleDragEnd}>
        <div className="mt-4 grid gap-3 md:grid-cols-3" data-testid="roadmap-kanban">
          {stages.map((stage) => (
            <RoadmapColumn
              key={stage}
              stage={stage}
              items={resolvedItems.filter((item) => item.stage === stage)}
              translate={translate}
              translateDiagnostic={translateDiagnostic}
              locale={locale}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem ? (
            <RoadmapCard
              item={activeItem}
              stage={activeItem.stage}
              translate={translate}
              translateDiagnostic={translateDiagnostic}
              locale={locale}
              isOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </section>
  );
}

function actionCategory(action: JournalActionCandidate): RoadmapActionCategory {
  if (action.type === "content") return "content";
  if (action.type === "bottleneck" || action.type === "lead_reminder") return "sales";

  const source = normalizedText(action.sourceInsight);
  if (source.includes("vente") || source.includes("closing") || source.includes("pipeline")) return "sales";
  if (source.includes("acquisition") || source.includes("contenu") || source.includes("youtube") || source.includes("newsletter")) return "content";
  return "team";
}

function priorityTier(score: number): "high" | "medium" | "low" {
  if (score >= 80) return "high";
  if (score >= 55) return "medium";
  return "low";
}

type RoadmapActionStart = (action: JournalActionCandidate, category: RoadmapActionCategory) => void;
type RoadmapActionComplete = (item: RoadmapDailyAction) => void;

function PlannerActionRow({
  action,
  completed,
  pending,
  compact = false,
  onStart,
  onComplete,
  translate,
  translateDiagnostic,
  locale,
}: {
  action: JournalActionCandidate;
  completed: boolean;
  pending: boolean;
  compact?: boolean;
  onStart: RoadmapActionStart;
  onComplete: RoadmapActionComplete;
  translate: (key: string, values?: Record<string, string | number>) => string;
  translateDiagnostic: (key: string) => string;
  locale: string;
}) {
  const category = actionCategory(action);
  const tier = priorityTier(action.priorityScore);
  const title = actionTitle(action, translate, translateDiagnostic);
  const impact = impactLabel(action, translate, locale);
  const dueLabel = action.dueDate
    ? translate("planner.due", {
        date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(`${action.dueDate}T00:00:00Z`)),
      })
    : null;
  const item: RoadmapDailyAction = { category, labelKey: category, action };

  return (
    <article className={cn("flex min-w-0 flex-col gap-3 p-3 sm:p-4", completed && "bg-surface-sunken/60", compact && "p-3")}>
      <div className="flex min-w-0 items-start gap-3">
        <button
          type="button"
          role="checkbox"
          aria-checked={completed}
          aria-label={completed ? translate("actions.markedDone") : translate("actions.markDone", { title })}
          disabled={completed || pending}
          onClick={() => onComplete(item)}
          className={cn(
            "mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
            completed
              ? "border-state-healthy bg-state-healthy text-text-on-dark"
              : "border-border bg-card text-transparent hover:border-accent hover:text-accent",
          )}
        >
          {completed ? <Check className="size-4" aria-hidden="true" /> : <Circle className="size-4" aria-hidden="true" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-accent-2-soft px-2 py-1 text-[10px] font-bold text-accent-2-text">
              {translate(`categories.${category}`)}
            </span>
            <span className="inline-flex items-center rounded-full bg-surface-sunken px-2 py-1 text-[10px] font-bold text-muted-foreground">
              {translate("planner.priority", { score: action.priorityScore })}: {translate(`planner.priorityTiers.${tier}`)}
            </span>
            <span className="text-[10px] font-semibold text-muted-foreground">
              {translate("planner.effort", { level: translate(`planner.effortLevels.${action.effort}`) })}
            </span>
          </div>
          <h3 className={cn("mt-2 text-sm font-bold leading-5", completed && "text-muted-foreground line-through")}>{title}</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{actionOrigin(action, translate, translateDiagnostic)}</p>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            <span className="font-semibold text-foreground">{impact}</span>
            {dueLabel && <span className="text-muted-foreground">{dueLabel}</span>}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 pl-13">
        {action.type === "data_checkin" ? (
          <Button type="button" size="sm" variant="outline" className="min-h-10 px-2.5 text-xs" asChild>
            <Link href={action.href}>
              {translate("planner.openData")}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" variant="outline" className="min-h-10 px-2.5 text-xs" disabled={pending || completed} onClick={() => onStart(action, category)}>
              {pending ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles className="size-3.5 text-accent-2" aria-hidden="true" />}
              {translate("actions.withFalco")}
            </Button>
            <Button type="button" size="sm" variant="secondary" className="min-h-10 px-2.5 text-xs" disabled={pending || completed} onClick={() => onComplete(item)}>
              {pending ? <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
              {completed ? translate("actions.completed") : translate("actions.done")}
            </Button>
          </>
        )}
      </div>
    </article>
  );
}

function RoadmapActionCenter({
  data,
  todos,
  projects,
  journalDays,
  calendarYear,
  calendarMonth,
  todayIso,
  callRoadmapRecommendations,
  accountId,
  fixtureMode,
  completedIds,
  pendingId,
  isPending,
  onStart,
  onComplete,
  translate,
  translateDiagnostic,
  locale,
}: {
  data: JournalActionLoopData;
  todos: RoadmapTodo[];
  projects: RoadmapProject[];
  journalDays: JournalDay[];
  calendarYear: number;
  calendarMonth: number;
  todayIso: string;
  callRoadmapRecommendations: CallRoadmapRecommendation[];
  accountId?: string;
  fixtureMode: boolean;
  completedIds: Set<string>;
  pendingId: string | null;
  isPending: boolean;
  onStart: RoadmapActionStart;
  onComplete: RoadmapActionComplete;
  translate: (key: string, values?: Record<string, string | number>) => string;
  translateDiagnostic: (key: string) => string;
  locale: string;
}) {
  const actions = [data.todayAction, ...data.allNextActions].filter((action, index, candidates): action is JournalActionCandidate => Boolean(action) && candidates.findIndex((candidate) => candidate?.id === action?.id) === index);
  const todayActions = actions.filter((action) => action.id === data.todayAction?.id || (action.dueDate !== null && action.dueDate <= todayIso));
  const todayTodos = todos.filter((todo) => todo.dueDate === null || todo.dueDate <= todayIso);
  const calendarEvents: JournalCalendarEvent[] = [
    ...todos
      .filter((todo) => todo.dueDate !== null)
      .map((todo) => ({ id: `todo:${todo.id}`, date: todo.dueDate as string, label: todo.label, type: "todo_business_improvement", completed: todo.done })),
    ...actions
      .filter((action) => action.dueDate !== null)
      .map((action) => ({ id: `action:${action.id}`, date: action.dueDate as string, label: actionTitle(action, translate, translateDiagnostic), type: "initiative_launched", completed: action.status === "done" })),
    ...data.clientReminders.map((reminder) => ({ id: `client-reminder:${reminder.id}`, date: reminder.remindAt.slice(0, 10), label: `${reminder.clientName} · ${reminder.note}`, type: "todo_business_improvement" })),
  ];

  return (
    <section aria-labelledby="roadmap-workspace-title">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-accent-2 uppercase">{translate("planner.eyebrow")}</p>
          <h2 id="roadmap-workspace-title" className="mt-1 text-lg font-bold">{translate("planner.title")}</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{translate("planner.subtitle")}</p>
        </div>
        <ListChecks className="size-5 text-accent-2" aria-hidden="true" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(18rem,0.72fr)_minmax(0,1.28fr)] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="sticker-card overflow-hidden" aria-labelledby="roadmap-today-title">
            <div className="border-b border-border bg-surface-sunken/60 px-4 py-3">
              <p className="text-xs font-bold tracking-[0.1em] text-accent-text uppercase">{translate("planner.todayEyebrow")}</p>
              <h3 id="roadmap-today-title" className="mt-1 text-base font-bold">{translate("planner.todayTitle")}</h3>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{translate("planner.todayHelp")}</p>
            </div>
            <div className="divide-y divide-border">
              {todayActions.map((action) => (
                <PlannerActionRow
                  key={action.id}
                  action={action}
                  compact
                  completed={action.status === "done" || completedIds.has(action.id)}
                  pending={isPending && pendingId === action.id}
                  onStart={onStart}
                  onComplete={onComplete}
                  translate={translate}
                  translateDiagnostic={translateDiagnostic}
                  locale={locale}
                />
              ))}
              {data.clientReminders.filter((reminder) => reminder.remindAt.slice(0, 10) <= todayIso).map((reminder) => (
                <Link
                  key={reminder.id}
                  href={`/delivrabilite/suivi-client?journeyId=${encodeURIComponent(reminder.journeyId)}`}
                  className="flex items-start gap-3 p-3 transition-colors hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
                >
                  <CalendarClock className="mt-0.5 size-4 shrink-0 text-accent-2" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{reminder.clientName}</span>
                    <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">{reminder.note}</span>
                  </span>
                </Link>
              ))}
              {todayActions.length === 0 && data.clientReminders.every((reminder) => reminder.remindAt.slice(0, 10) > todayIso) && (
                <p className="p-4 text-sm text-muted-foreground">{translate("planner.todayEmpty")}</p>
              )}
            </div>
          </section>

          <TodoPanel todos={todayTodos} projects={projects} title={translate("planner.personalTasks")} />
        </div>

        <div className="min-w-0">
          <JournalCalendar
            year={calendarYear}
            month={calendarMonth}
            days={journalDays}
            todayIso={todayIso}
            basePath={fixtureMode ? "/e2e/roadmap" : "/roadmap"}
            additionalEvents={calendarEvents}
          />
          <p className="mt-2 text-xs leading-5 text-muted-foreground">{translate("planner.calendarHelp")}</p>
        </div>
      </div>

      <section className="mt-6" aria-labelledby="roadmap-queue-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-accent-2 uppercase">{translate("planner.queueEyebrow")}</p>
            <h3 id="roadmap-queue-title" className="mt-1 text-lg font-bold">{translate("planner.queueTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{translate("planner.queueHelp")}</p>
          </div>
          <span className="rounded-full bg-accent-2-soft px-3 py-1.5 text-xs font-bold text-accent-2-text">{translate("planner.actionCount", { count: actions.length })}</span>
        </div>
        <div className="sticker-card mt-4 divide-y divide-border overflow-hidden">
          {actions.length > 0 ? (
            actions.map((action) => (
              <PlannerActionRow
                key={action.id}
                action={action}
                completed={action.status === "done" || completedIds.has(action.id)}
                pending={isPending && pendingId === action.id}
                onStart={onStart}
                onComplete={onComplete}
                translate={translate}
                translateDiagnostic={translateDiagnostic}
                locale={locale}
              />
            ))
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{translate("planner.noActions")}</p>
          )}
        </div>
      </section>

      {callRoadmapRecommendations.length > 0 && (
        <section className="mt-6" aria-labelledby="roadmap-call-actions-title">
          <div>
            <p className="text-xs font-bold tracking-[0.12em] text-accent-2 uppercase">{translate("planner.falcoActionsEyebrow")}</p>
            <h3 id="roadmap-call-actions-title" className="mt-1 text-lg font-bold">{translate("callRecommendations.title")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{translate("callRecommendations.help")}</p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {callRoadmapRecommendations.map((recommendation) => (
              <Link key={recommendation.id} href={recommendation.href} className="sticker-card p-4 transition-colors hover:border-accent-2-border hover:bg-accent-2-soft/30 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
                <p className="text-sm font-bold">{recommendation.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{recommendation.description}</p>
                <span className="mt-3 inline-flex text-xs font-bold text-accent-2-text">{translate("callRecommendations.openCall")} →</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {data.roadmapVisible && (
        <div className="mt-6">
          <RoadmapJourney
            items={data.roadmapItems}
            translate={translate}
            translateDiagnostic={translateDiagnostic}
            locale={locale}
            storageKey={accountId ? `minaly:roadmap-stages:${accountId}` : null}
          />
        </div>
      )}
    </section>
  );
}

export function RoadmapView({
  data,
  streak,
  callRoadmapRecommendations = [],
  accountId,
  fixtureMode = false,
  todos = [],
  projects = [],
  journalDays = [],
  calendarYear = 2026,
  calendarMonth = 1,
  todayIso = new Date().toISOString().slice(0, 10),
}: RoadmapViewProps) {
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
    setShowIntro(window.localStorage.getItem("minaly:roadmap-intro-dismissed") !== "1");
  }, []);

  function dismissIntro() {
    window.localStorage.setItem("minaly:roadmap-intro-dismissed", "1");
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

      <BottleneckBlock
        data={data}
        pending={isPending && pendingId === `bottleneck:${data.bottleneck?.key}`}
        onStart={startBottleneck}
        translate={translate}
        translateDiagnostic={translateDiagnostic}
        locale={locale}
      />

      {error && (
        <p className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-sm text-state-critical" role="alert">
          <CircleAlert className="size-4" aria-hidden="true" />
          {error}
        </p>
      )}

      <RoadmapActionCenter
        data={data}
        todos={todos}
        projects={projects}
        journalDays={journalDays}
        calendarYear={calendarYear}
        calendarMonth={calendarMonth}
        todayIso={todayIso}
        callRoadmapRecommendations={callRoadmapRecommendations}
        accountId={accountId}
        fixtureMode={fixtureMode}
        completedIds={completedIds}
        pendingId={pendingId}
        isPending={isPending}
        onStart={startAction}
        onComplete={completeAction}
        translate={translate}
        translateDiagnostic={translateDiagnostic}
        locale={locale}
      />

      <FalcoDrawer open={chatContext !== null} onOpenChange={(open) => { if (!open) setChatContext(null); }}>
        <DrawerContent>
          {chatContext && <LazyImproveChat context={chatContext} period="3-months" gapBadge={null} />}
        </DrawerContent>
      </FalcoDrawer>
    </div>
  );
}
