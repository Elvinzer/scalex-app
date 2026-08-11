"use client";

import {
  ArrowRight,
  Check,
  CircleAlert,
  Clock3,
  MessageCircle,
  Sparkles,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Falco } from "@/components/falco/falco";
import { StreakMomentum } from "@/components/streak/streak-momentum";
import { LazyImproveChat } from "@/components/lazy-improve-chat";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import type { ChatContext } from "@/lib/chat-context";
import { formatEur } from "@/lib/currency";
import type { JournalActionCandidate, JournalActionState, JournalEffort } from "@/lib/journal/action-generator";
import type { JournalActionLoopData, JournalResult, JournalTimeline, JournalReminder } from "@/lib/journal/action-loop";
import type { StreakSnapshot } from "@/lib/streak/service";
import { recordImproveChatOpened } from "@/lib/improve-chat-tracking";

import { completeJournalAction, dismissJournalAction, snoozeJournalAction, startJournalAction } from "./action-loop-actions";
import { TodoPanel } from "./todo-panel";

type Todo = {
  id: string;
  label: string;
  dueDate: string | null;
  done: boolean;
  projectId: string | null;
  isBusinessImprovement: boolean;
};

type Project = { id: string; name: string };

type JournalTranslator = (key: string, values?: Record<string, string | number>) => string;

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
}

function formatImpact(impact: JournalActionCandidate["impact"], locale: string, t: JournalTranslator): string {
  if (!impact) return t("impactUnknown");
  if (impact.unit === "eur_month") return impact.range ? `≈${formatEur(impact.range.min, locale)}–${formatEur(impact.range.max, locale)}${t("perMonth")}` : `≈${formatEur(impact.value, locale)}${t("perMonth")}`;
  if (impact.unit === "clients_month") return `≈${formatNumber(impact.value, locale)} ${t(impact.value > 1 ? "clientsMany" : "clientsOne")}${t("perMonth")}`;
  return `≈${formatNumber(impact.value, locale)} ${t("views")}`;
}

function effortLabel(value: JournalEffort, t: JournalTranslator): string {
  if (value === "eleve") return t("effortHigh");
  if (value === "moyen") return t("effortMedium");
  return t("effortLow");
}

function effortClass(value: JournalEffort): string {
  if (value === "eleve") return "bg-state-critical-bg text-state-critical";
  if (value === "moyen") return "bg-state-caution-bg text-state-caution";
  return "bg-state-healthy-bg text-state-healthy";
}

function formatDate(value: string, locale: string): string {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function formatRate(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)} %`;
}

function statusText(value: JournalActionState, t: JournalTranslator): string {
  if (value === "doing") return t("statusDoing");
  if (value === "snoozed") return t("statusSnoozed");
  if (value === "done") return t("statusDone");
  return t("statusPending");
}

function queueWithout(queue: JournalActionCandidate[], actionId: string): JournalActionCandidate[] {
  return queue.filter((action) => action.id !== actionId);
}

function ActionHero({
  action,
  emptyState,
  isPending,
  onStart,
  onComplete,
}: {
  action: JournalActionCandidate | null;
  emptyState: JournalActionLoopData["emptyState"];
  isPending: boolean;
  onStart: (action: JournalActionCandidate) => void;
  onComplete: (action: JournalActionCandidate) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("journal");
  if (!action) {
    const isInsufficient = emptyState === "insufficient_data";
    return (
      <section className="rounded-[var(--radius-hero)] bg-surface-dark bg-[image:var(--gradient-dark)] px-6 py-7 text-text-on-dark shadow-[var(--shadow-lg)] sm:px-8" data-testid="journal-empty-state">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Falco pose={isInsufficient ? "thinking" : "happy"} size="md" className="shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">{isInsufficient ? t("startHere") : t("greatProgress")}</p>
            <h2 className="mt-2 max-w-2xl text-2xl leading-tight font-bold">
              {isInsufficient ? t("needNumbersTitle") : t("todayCompleteTitle")}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-text-on-dark-muted">
              {isInsufficient
                ? t("checkinHelp")
                : t("keepRhythmHelp")}
            </p>
            <Button asChild size="lg" className="mt-5">
              <Link href={isInsufficient ? "/datas" : "/diagnostic#discovery"}>
                {isInsufficient ? t("fillNumbers") : t("nextGoal")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-[var(--radius-hero)] bg-surface-dark bg-[image:var(--gradient-dark)] px-6 py-7 text-text-on-dark shadow-[var(--shadow-lg)] sm:px-8" data-testid="journal-today-action">
      <div className="pointer-events-none absolute -right-24 -top-24 size-64 rounded-full bg-accent/10 blur-3xl" aria-hidden="true" />
      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Falco pose="alert" size="md" className="mt-1 hidden shrink-0 sm:block" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-bold tracking-[0.12em] text-accent uppercase">{t("dailyAction")}</p>
              {action.overdue && (
                <span className="rounded-full border border-state-caution/40 bg-state-caution/15 px-2.5 py-1 text-[11px] font-bold text-state-caution">
                  {t("overdue", { days: action.overdueDays })}
                </span>
              )}
            </div>
            <h2 className="mt-3 max-w-2xl text-2xl leading-tight font-bold tracking-[-0.02em]">{action.title}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-text-on-dark-muted">{action.sourceInsight}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-accent/40 bg-accent/15 px-3 py-1 text-sm font-bold text-accent">{formatImpact(action.impact, locale, t)}</span>
              <span className="rounded-full border border-mist/20 bg-mist/10 px-3 py-1 text-xs font-bold text-text-on-dark">{t("effortLabel")} {effortLabel(action.effort, t).toLowerCase()}</span>
              {action.status === "doing" && <span className="rounded-full border border-mist/20 bg-mist/10 px-3 py-1 text-xs font-bold text-text-on-dark">{statusText(action.status, t)}</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:w-[250px] lg:flex-col">
          <Button type="button" size="lg" onClick={() => onStart(action)} disabled={isPending} className="w-full">
            {action.type === "data_checkin" ? t("fillNumbers") : t("doWithFalco")}
          </Button>
          <Button
            type="button"
            size="lg"
            variant="outline"
            onClick={() => onComplete(action)}
            disabled={isPending}
            className="w-full border-mist/25 bg-transparent text-text-on-dark hover:bg-mist/10 hover:text-text-on-dark"
          >
            <Check className="size-4" aria-hidden="true" />
            {t("done")}
          </Button>
        </div>
      </div>
    </section>
  );
}

function CompactActionCard({
  action,
  isPending,
  onMakeToday,
  onSnooze,
  onDismiss,
}: {
  action: JournalActionCandidate;
  isPending: boolean;
  onMakeToday: (action: JournalActionCandidate) => void;
  onSnooze: (action: JournalActionCandidate) => void;
  onDismiss: (action: JournalActionCandidate) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("journal");
  return (
    <article className="sticker-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between" data-testid="journal-next-action">
      <div className="min-w-0 flex-1">
        {action.overdue && <p className="mb-1 text-xs font-bold text-state-caution">{t("overdue", { days: action.overdueDays })}</p>}
        <h3 className="text-sm leading-snug font-bold">{action.title}</h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{action.sourceInsight}</span>
          <span className="text-xs text-muted-foreground" aria-hidden="true">·</span>
          <span className="text-xs font-bold text-accent-text">{formatImpact(action.impact, locale, t)}</span>
          <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${effortClass(action.effort)}`}>{t("effortLabel")} {effortLabel(action.effort, t).toLowerCase()}</span>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
        <Button type="button" size="sm" variant="outline" onClick={() => onMakeToday(action)} disabled={isPending} className="min-h-11">{t("doAction")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onSnooze(action)} disabled={isPending} className="min-h-11">{t("snooze")}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => onDismiss(action)} disabled={isPending} className="min-h-11 text-muted-foreground">{t("notForMe")}</Button>
      </div>
    </article>
  );
}

function NextActionsSection({
  actions,
  allActions,
  moreActionsCount,
  isPending,
  onMakeToday,
  onSnooze,
  onDismiss,
}: {
  actions: JournalActionCandidate[];
  allActions: JournalActionCandidate[];
  moreActionsCount: number;
  isPending: boolean;
  onMakeToday: (action: JournalActionCandidate) => void;
  onSnooze: (action: JournalActionCandidate) => void;
  onDismiss: (action: JournalActionCandidate) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const t = useTranslations("journal");
  if (actions.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="journal-next-actions-title" data-testid="journal-next-actions">
      <Accordion type="single" collapsible value={expanded ? "next-actions" : ""} onValueChange={(value) => setExpanded(value === "next-actions")} className="w-full">
        <AccordionItem value="next-actions" className="w-full border-0">
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
            <AccordionTrigger className="min-h-11 min-w-0 flex-1 rounded-[var(--radius-control)] border border-border bg-card px-4 py-2 hover:bg-muted/60">
              <div className="min-w-0 text-left">
                <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">{t("afterThat")}</p>
                <h2 id="journal-next-actions-title" className="mt-1 text-lg font-bold tracking-[-0.01em]">{t("nextActions")}</h2>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[11px] font-bold text-muted-foreground">{allActions.length} {t("toPrioritize")}</span>
            </AccordionTrigger>
            {moreActionsCount > 0 && (
              <button type="button" onClick={() => setDialogOpen(true)} className="inline-flex min-h-11 shrink-0 items-center px-2 text-xs font-bold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline sm:px-1">
                {t("seeAll", { count: allActions.length })}
              </button>
            )}
          </div>
          <AccordionContent className="pt-2">
            <div className="flex flex-col gap-2">
              {actions.map((action) => (
                <CompactActionCard key={action.id} action={action} isPending={isPending} onMakeToday={onMakeToday} onSnooze={onSnooze} onDismiss={onDismiss} />
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogTitle className="text-lg font-bold">{t("allUpcoming")}</DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">{t("priorityUnique")}</p>
          <div className="mt-5 flex flex-col gap-2">
            {allActions.map((action) => (
              <CompactActionCard key={action.id} action={action} isPending={isPending} onMakeToday={(selected) => { onMakeToday(selected); setDialogOpen(false); }} onSnooze={(selected) => { onSnooze(selected); setDialogOpen(false); }} onDismiss={(selected) => { onDismiss(selected); setDialogOpen(false); }} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ResultCard({ result, onAdjust }: { result: JournalResult; onAdjust: (result: JournalResult) => void }) {
  const locale = useLocale();
  const t = useTranslations("journal");
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    if (result.state !== "positive") return;
    const key = `scalex:journal-result-seen:${result.id}`;
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
    setCelebrate(true);
    const timer = window.setTimeout(() => setCelebrate(false), 4200);
    return () => window.clearTimeout(timer);
  }, [result.id, result.state]);

  return (
    <article className="sticker-card relative overflow-hidden p-5" data-testid="journal-result">
      {celebrate && <div className="absolute top-0 right-0 flex items-center gap-1.5 rounded-bl-[var(--radius-control)] bg-state-healthy-bg px-3 py-2 text-xs font-bold text-state-healthy animate-rise" role="status"><Sparkles className="size-3.5" aria-hidden="true" /> {t("greatProgress")}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{result.sourceInsight}</p>
          <h3 className="mt-1 text-base font-bold">{result.title}</h3>
        </div>
        {result.state === "positive" ? <TrendingUp className="size-5 text-state-healthy" aria-label={t("positiveResultAria")} /> : result.state === "neutral" ? <TrendingDown className="size-5 text-muted-foreground" aria-label={t("neutralResultAria")} /> : <Clock3 className="size-5 text-muted-foreground" aria-label={t("waitingResultAria")} />}
      </div>
      <p className="mt-4 text-sm leading-6">
        {result.state === "positive" && result.beforeValue !== null && result.afterValue !== null
          ? <>{t("workedOn")} <span className="font-bold">{result.metricLabel.toLowerCase()}</span> {t("onDate")} {formatDate(result.completedAt, locale)} : {t("rateWentFrom")} <span className="font-bold">{formatRate(result.beforeValue)}</span> {t("to")} <span className="font-bold text-state-healthy">{formatRate(result.afterValue)}</span>.</>
          : result.state === "neutral"
            ? <>{t("metricNoChange")} <span className="font-bold">{result.metricLabel.toLowerCase()}</span>. {t("adjustWithoutRestart")}</>
            : result.measurementReason ?? t("waitingNumbers")}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {result.state === "positive" && result.deltaValue !== null && <span className="rounded-full bg-state-healthy-bg px-3 py-1 text-xs font-bold text-state-healthy">+{formatRate(result.deltaValue)} {t("sinceAction")}</span>}
        {result.state === "neutral" && <Button type="button" variant="outline" size="sm" onClick={() => onAdjust(result)} className="min-h-11"><MessageCircle className="size-3.5" aria-hidden="true" /> {t("adjust")}</Button>}
        {result.state === "waiting" && <Button asChild type="button" variant="outline" size="sm" className="min-h-11"><Link href="/datas">{t("checkin")} <ArrowRight className="size-3.5" aria-hidden="true" /></Link></Button>}
      </div>
    </article>
  );
}

function ResultsSection({ results, onAdjust }: { results: JournalResult[]; onAdjust: (result: JournalResult) => void }) {
  const t = useTranslations("journal");
  if (results.length === 0) return null;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="journal-results-title" data-testid="journal-results">
      <div>
        <p className="text-xs font-bold tracking-[0.12em] text-accent-2-text uppercase">{t("loopClosed")}</p>
          <h2 id="journal-results-title" className="mt-1 text-lg font-bold tracking-[-0.01em]">{t("resultsTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("resultsHelp")}</p>
      </div>
      <div className="grid gap-3">{results.map((result) => <ResultCard key={result.id} result={result} onAdjust={onAdjust} />)}</div>
    </section>
  );
}

function buildChartPath(points: { value: number | null }[]): string {
  const values = points.map((point) => point.value);
  const coordinates = values.flatMap((value, index) => value === null ? [] : [[index, value] as const]);
  if (coordinates.length < 2) return "";
  return coordinates.map(([index, value], pointIndex) => {
    const x = 24 + (index / Math.max(1, points.length - 1)) * 672;
    const y = 154 - (value / 100) * 122;
    return `${pointIndex === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

function TimelineSection({ timeline }: { timeline: JournalTimeline }) {
  const locale = useLocale();
  const t = useTranslations("journal");
  const [metricKey, setMetricKey] = useState(timeline.selectedMetricKey ?? "");
  const points = timeline.seriesByMetric[metricKey] ?? timeline.points;
  const path = buildChartPath(points);
  const markers = timeline.markers.filter((marker) => marker.metricKey === metricKey);
  if (!timeline.visible || points.length === 0) return null;

  return (
    <section className="sticker-card overflow-hidden p-5 sm:p-6" aria-labelledby="journal-timeline-title" data-testid="journal-timeline">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">{t("weeks")}</p>
          <h2 id="journal-timeline-title" className="mt-1 text-lg font-bold tracking-[-0.01em]">{t("traceTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("traceHelp")}</p>
        </div>
        {timeline.metrics.length > 1 && (
          <label className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
            {t("metric")}
            <select value={metricKey} onChange={(event) => setMetricKey(event.target.value)} className="min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 text-sm font-bold text-foreground outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/15">
              {timeline.metrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="mt-5 rounded-[var(--radius-control)] border border-border bg-surface-sunken/60 p-2 sm:p-4">
        <svg viewBox="0 0 720 180" className="h-auto w-full" role="img" aria-label={`${t("evolutionOf")} ${timeline.metrics.find((metric) => metric.key === metricKey)?.label ?? t("theMetric")}`}>
          {[0, 25, 50, 75, 100].map((value) => {
            const y = 154 - (value / 100) * 122;
            return <line key={value} x1="24" x2="696" y1={y} y2={y} stroke="var(--border)" strokeDasharray="3 7" strokeWidth="1" />;
          })}
          {markers.map((marker) => {
            const index = points.findIndex((point) => point.weekStart === marker.date || marker.date >= point.weekStart && marker.date < addSevenDays(point.weekStart));
            if (index < 0) return null;
            const x = 24 + (index / Math.max(1, points.length - 1)) * 672;
            return <g key={`${marker.date}:${marker.label}`}><line x1={x} x2={x} y1="18" y2="154" stroke="var(--accent)" strokeDasharray="5 5" strokeWidth="1.5" /><title>{marker.label} · {formatDate(marker.date, locale)}</title></g>;
          })}
          {path && <path d={path} fill="none" stroke="var(--accent-2)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />}
          {points.map((point, index) => {
            if (point.value === null) return null;
            const x = 24 + (index / Math.max(1, points.length - 1)) * 672;
            const y = 154 - (point.value / 100) * 122;
            return <circle key={point.weekStart} cx={x} cy={y} r="4.5" fill="var(--surface)" stroke="var(--accent-2)" strokeWidth="3"><title>{point.label} · {point.value} %</title></circle>;
          })}
          <text x="24" y="174" fill="var(--muted-foreground)" fontSize="11">{points[0]?.label}</text>
          <text x="696" y="174" textAnchor="end" fill="var(--muted-foreground)" fontSize="11">{points[points.length - 1]?.label}</text>
        </svg>
        <p className="sr-only">{points.filter((point) => point.value !== null).map((point) => `${point.label}: ${point.value} %`).join(". ")}</p>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2"><span className="size-2 rounded-full bg-accent-2" aria-hidden="true" /> {t("rateEvolution")}</span>
        <span className="inline-flex items-center gap-2"><span className="h-4 w-px border-l border-dashed border-accent" aria-hidden="true" /> {t("actionCompleted")}</span>
      </div>
    </section>
  );
}

function addSevenDays(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

function RemindersSection({ reminders, isPending, onComplete }: { reminders: JournalReminder[]; isPending: boolean; onComplete: (reminder: JournalReminder) => void }) {
  const locale = useLocale();
  const t = useTranslations("journal");
  return (
    <section className="sticker-card p-5 sm:p-6" aria-labelledby="journal-reminders-title" data-testid="journal-reminders">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">{t("pipeline")}</p>
          <h2 id="journal-reminders-title" className="mt-1 text-lg font-bold tracking-[-0.01em]">{t("todayFollowups")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("followupsHelp")}</p>
        </div>
        <Link href="/ventes/pipeline" className="inline-flex min-h-11 items-center text-xs font-bold text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">{t("openPipeline")} <ArrowRight className="ml-1 size-3.5" aria-hidden="true" /></Link>
      </div>
      {reminders.length === 0 ? <p className="mt-5 rounded-[var(--radius-control)] border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">{t("noFollowups")}</p> : (
        <ul className="mt-5 flex flex-col divide-y divide-border">
          {reminders.map((reminder) => (
            <li key={reminder.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-bold">{reminder.leadName}</p>
                <p className="mt-1 text-sm text-muted-foreground">{reminder.note || t("followupToDo")}</p>
                <p className={`mt-1 text-xs font-bold ${reminder.overdueDays > 0 ? "text-state-caution" : "text-muted-foreground"}`}>
                  {reminder.overdueDays > 0 ? t("lateBy", { days: reminder.overdueDays }) : `${t("plannedFor")} ${formatDate(reminder.reminderDate, locale)}`}
                </p>
              </div>
              <Button type="button" size="sm" variant="outline" className="min-h-11 self-start sm:self-auto" disabled={isPending} onClick={() => onComplete(reminder)}><Check className="size-3.5" aria-hidden="true" /> {t("doneShort")}</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function JournalTasksIntro() {
  const t = useTranslations("journal");
  return (
    <div>
      <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">{t("besideLoop")}</p>
      <p className="mt-1 text-sm text-muted-foreground">{t("freeList")}</p>
    </div>
  );
}

function JournalTasksSection({ todos, projects }: { todos: Todo[]; projects: Project[] }) {
  const t = useTranslations("journal");
  return (
    <section aria-label={t("myTasks")}>
      <TodoPanel todos={todos} projects={projects} />
    </section>
  );
}

function MomentumStrip({ momentum }: { momentum: JournalActionLoopData["momentum"] }) {
  const t = useTranslations("journal");
  return (
    <section className="sticker-card overflow-hidden p-4 sm:p-5" aria-labelledby="journal-momentum-title" data-testid="journal-momentum">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold tracking-[0.12em] text-muted-foreground uppercase">{t("momentum")}</p>
          <h2 id="journal-momentum-title" className="mt-1 text-base font-bold">{t("movingAtYourPace")}</h2>
        </div>
        <Sparkles className="size-5 text-accent-2" aria-hidden="true" />
      </div>
      <div className="mt-4 grid grid-cols-3 divide-x divide-border text-center">
        <div className="px-2"><p className="text-2xl font-bold tabular-nums">{momentum.actionsDoneThisWeek}</p><p className="mt-1 text-[11px] text-muted-foreground">{t("actionsThisWeek")}</p></div>
        <div className="px-2"><p className="text-2xl font-bold tabular-nums">{momentum.scaleScoreDelta30d === null ? "—" : `${momentum.scaleScoreDelta30d > 0 ? "+" : ""}${momentum.scaleScoreDelta30d}`}</p><p className="mt-1 text-[11px] text-muted-foreground">{t("scaleScore30d")}</p></div>
        <div className="px-2"><p className="text-2xl font-bold tabular-nums">{momentum.activeWeekStreak}</p><p className="mt-1 text-[11px] text-muted-foreground">{t("activeWeeks")}</p></div>
      </div>
    </section>
  );
}

export function JournalView({ data, todos, projects, streak = null, fixtureMode = false }: { data: JournalActionLoopData; todos: Todo[]; projects: Project[]; streak?: StreakSnapshot | null; fixtureMode?: boolean }) {
  const router = useRouter();
  const t = useTranslations("journal");
  const [queue, setQueue] = useState<JournalActionCandidate[]>(() => [data.todayAction, ...data.allNextActions].filter((action): action is JournalActionCandidate => Boolean(action)));
  const [reminders, setReminders] = useState(data.reminders);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);

  useEffect(() => {
    setShowIntro(window.localStorage.getItem("scalex:journal-intro-dismissed") !== "1");
  }, []);

  const todayAction = queue[0] ?? null;
  const nextActions = queue.slice(1, 6);
  const allNextActions = queue.slice(1);
  const moreActionsCount = Math.max(0, allNextActions.length - nextActions.length);
  const hasLoopHistory = data.results.length > 0 || data.timeline.visible;

  function dismissIntro() {
    window.localStorage.setItem("scalex:journal-intro-dismissed", "1");
    setShowIntro(false);
  }

  function openFalco(action: JournalActionCandidate) {
    setError(null);
    if (action.type === "data_checkin") {
      router.push(action.href);
      return;
    }
    if (fixtureMode) {
      setChatContext(action.chatContext);
      return;
    }
    setPendingId(action.id);
    startTransition(async () => {
      const result = await startJournalAction({ type: action.type, sourceId: action.sourceId });
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setChatContext(action.chatContext);
      if (!fixtureMode) void recordImproveChatOpened(action.chatContext);
    });
  }

  function complete(action: JournalActionCandidate) {
    setError(null);
    if (action.type === "data_checkin") {
      router.push(action.href);
      return;
    }
    if (fixtureMode) {
      setQueue((current) => queueWithout(current, action.id));
      if (action.type === "lead_reminder") setReminders((current) => current.filter((reminder) => reminder.id !== action.sourceId));
      return;
    }
    setPendingId(action.id);
    startTransition(async () => {
      const result = await completeJournalAction({ type: action.type, sourceId: action.sourceId });
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setQueue((current) => queueWithout(current, action.id));
      if (action.type === "lead_reminder") setReminders((current) => current.filter((reminder) => reminder.id !== action.sourceId));
      router.refresh();
    });
  }

  function makeToday(action: JournalActionCandidate) {
    setQueue((current) => {
      const selected = current.find((candidate) => candidate.id === action.id);
      if (!selected) return current;
      return [selected, ...current.filter((candidate) => candidate.id !== action.id)];
    });
  }

  function snooze(action: JournalActionCandidate) {
    if (action.type === "data_checkin" || action.type === "lead_reminder") return;
    if (fixtureMode) {
      setQueue((current) => queueWithout(current, action.id));
      return;
    }
    setPendingId(action.id);
    startTransition(async () => {
      const result = await snoozeJournalAction({ type: action.type, sourceId: action.sourceId });
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setQueue((current) => queueWithout(current, action.id));
      router.refresh();
    });
  }

  function dismiss(action: JournalActionCandidate) {
    if (action.type === "data_checkin" || action.type === "lead_reminder") return;
    if (fixtureMode) {
      setQueue((current) => queueWithout(current, action.id));
      return;
    }
    setPendingId(action.id);
    startTransition(async () => {
      const result = await dismissJournalAction({ type: action.type, sourceId: action.sourceId });
      setPendingId(null);
      if (result.error) {
        setError(result.error);
        return;
      }
      setQueue((current) => queueWithout(current, action.id));
      router.refresh();
    });
  }

  function openResultChat(result: JournalResult) {
    setChatContext(result.chatContext);
    if (!fixtureMode) void recordImproveChatOpened(result.chatContext);
  }

  const nextData = useMemo(() => ({ ...data, todayAction, nextActions, allNextActions, moreActionsCount }), [data, todayAction, nextActions, allNextActions, moreActionsCount]);

  return (
    <div className="flex flex-col gap-7" data-testid="journal-page">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold tracking-[0.14em] text-accent uppercase">{t("startingPoint")}</p>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-[22px] leading-[1.2] font-bold tracking-[-0.01em]">{t("title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{t("subtitle")}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-bold text-muted-foreground"><span className="size-2 rounded-full bg-state-healthy" aria-hidden="true" /> {t("activeLoop")}</span>
        </div>
      </header>

      {showIntro && (
        <aside className="flex items-start gap-3 rounded-[var(--radius-card)] border border-accent-2-border bg-accent-2-soft/60 px-4 py-3" role="note">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-accent-2" aria-hidden="true" />
          <p className="flex-1 text-sm leading-6"><span className="font-bold">{t("principle")}</span> {t("principleHelp")}</p>
          <button type="button" onClick={dismissIntro} aria-label={t("hideExplanation")} className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-card"><X className="size-4" aria-hidden="true" /></button>
        </aside>
      )}

      {/* Rythme avant contenu : la série se lit d'un coup d'œil, puis
          l'action du jour prend le relais. */}
      {streak && <StreakMomentum snapshot={streak} />}

      <ActionHero action={todayAction} emptyState={data.emptyState} isPending={isPending && pendingId === todayAction?.id} onStart={openFalco} onComplete={complete} />

      {error && <p className="flex items-center gap-2 rounded-[var(--radius-control)] border border-state-critical/30 bg-state-critical-bg px-3 py-2 text-sm text-state-critical" role="alert"><CircleAlert className="size-4" aria-hidden="true" /> {error}</p>}

      <NextActionsSection actions={nextData.nextActions} allActions={nextData.allNextActions} moreActionsCount={nextData.moreActionsCount} isPending={isPending} onMakeToday={makeToday} onSnooze={snooze} onDismiss={dismiss} />

      {hasLoopHistory && (
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.62fr)] lg:items-start">
          <div className="flex min-w-0 flex-col gap-7">
          <ResultsSection results={data.results} onAdjust={openResultChat} />
          <TimelineSection timeline={data.timeline} />
          </div>
          <aside className="flex min-w-0 flex-col gap-7 lg:sticky lg:top-6">
            <div className="flex flex-col gap-3">
              <JournalTasksIntro />
              <JournalTasksSection todos={todos} projects={projects} />
            </div>
            <MomentumStrip momentum={data.momentum} />
          </aside>
        </div>
      )}

      <RemindersSection reminders={reminders} isPending={isPending && pendingId !== null} onComplete={(reminder) => complete({
        id: `lead_reminder:${reminder.id}`,
        type: "lead_reminder",
        sourceType: "lead_reminder",
        sourceId: reminder.id,
        title: t("followupTitle", { name: reminder.leadName }),
        sourceInsight: t("pipelineFollowup"),
        metricKey: "followupRecovery",
        impact: null,
        effort: "faible",
        priorityScore: 96,
        status: "pending",
        dueDate: reminder.reminderDate,
        createdAt: null,
        doneAt: null,
        resumeAt: null,
        overdue: reminder.overdueDays > 0,
        overdueDays: reminder.overdueDays,
        chatContext: { topicType: "metric", topicKey: "followupRecovery", topicLabel: t("followupTitle", { name: reminder.leadName }), sourcePage: "journal_action" },
        href: "/ventes/pipeline",
        isPersisted: true,
      })} />

      {!hasLoopHistory && (
        <div className="flex flex-col gap-3">
          <JournalTasksIntro />
          <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
            <JournalTasksSection todos={todos} projects={projects} />
            <MomentumStrip momentum={data.momentum} />
          </div>
        </div>
      )}

      <Drawer open={chatContext !== null} onOpenChange={(open) => { if (!open) setChatContext(null); }}>
        <DrawerContent>
          {chatContext && <LazyImproveChat context={chatContext} period="3-months" gapBadge={null} />}
        </DrawerContent>
      </Drawer>
    </div>
  );
}
