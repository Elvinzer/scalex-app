"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { formatCrmDateTimeInput, getCrmLocalDayBounds, getCrmTomorrowAtSameLocalTime, parseCrmDateTimeInput } from "@/lib/crm/due-date";
import type { CrmActionCategory, CrmActionView } from "@/lib/crm/types";

import { completeActionAction, rescheduleActionAction } from "./crm-actions";

type DueGroup = "overdue" | "today" | "upcoming";
type QueueFilters = { category?: CrmActionCategory; relanceOnly?: boolean; overdueOnly?: boolean; dueTodayOnly?: boolean; timeZone?: string };

export function CrmActionList({ initialActions, groupByDueDate = false, featureFirstAction = false, featuredActionLabel, nextActionFilters, returnTo = "/crm/leads", timeZone: providedTimeZone }: { initialActions: CrmActionView[]; groupByDueDate?: boolean; featureFirstAction?: boolean; featuredActionLabel?: string; nextActionFilters?: QueueFilters; returnTo?: string; timeZone?: string }) {
  const t = useTranslations("crm.actions");
  const callsT = useTranslations("crm.calls");
  const locale = useLocale();
  const timeZone = providedTimeZone ?? nextActionFilters?.timeZone ?? "UTC";
  const [actions, setActions] = useState(initialActions);
  const [error, setError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [nextLeadId, setNextLeadId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function leadHref(leadId: string): string {
    const query = new URLSearchParams({ returnTo });
    return `/crm/leads/${leadId}?${query.toString()}`;
  }

  function matchesQueueFilters(action: CrmActionView, dueAt = new Date(action.dueAt), now = new Date()): boolean {
    if (!nextActionFilters) return true;
    if (nextActionFilters.category && action.category !== nextActionFilters.category) return false;
    if (nextActionFilters.relanceOnly && action.type !== "follow_up" && action.type !== "no_show_follow_up") return false;
    if (nextActionFilters.overdueOnly && !(action.status === "open" && dueAt.getTime() < now.getTime())) return false;
    if (nextActionFilters.dueTodayOnly) {
      const { start, end } = getCrmLocalDayBounds(nextActionFilters.timeZone ?? timeZone);
      if (!(action.status === "open" && dueAt.getTime() >= start.getTime() && dueAt.getTime() < end.getTime())) return false;
    }
    return true;
  }

  function applyResult(actionId: string, result: { error: string | null; nextLeadId?: string }) {
    if (result.error) {
      setError(result.error);
      return false;
    }
    setActions((items) => items.filter((item) => item.id !== actionId));
    setNextLeadId(result.nextLeadId ?? null);
    return true;
  }

  function update(actionId: string, status: "completed" | "cancelled") {
    const action = actions.find((item) => item.id === actionId);
    if (!action) return;
    setError(null);
    setAnnouncement(t("saving"));
    startTransition(async () => {
      try {
        const result = await completeActionAction({ actionId, status, idempotencyKey: `crm-action:${actionId}:${status}`, nextFilters: nextActionFilters });
        if (applyResult(actionId, result)) setAnnouncement(`${action.title}: ${t(status)}`);
        else setAnnouncement("");
      } catch {
        setError(t("requestFailed"));
        setAnnouncement("");
      }
    });
  }

  function reschedule(actionId: string, dueAt: string) {
    const dueDate = parseCrmDateTimeInput(dueAt, timeZone);
    if (!dueDate) {
      setError(t("invalidDue"));
      return;
    }
    const action = actions.find((item) => item.id === actionId);
    if (!action) return;
    setError(null);
    setAnnouncement(t("saving"));
    startTransition(async () => {
      try {
        const result = await rescheduleActionAction({ actionId, dueAt: dueDate.toISOString(), idempotencyKey: `crm-reschedule:${actionId}:${dueDate.toISOString()}`, nextFilters: nextActionFilters });
        if (result.error) {
          setError(result.error);
          setAnnouncement("");
          return;
        }
        setActions((items) => items.map((item) => item.id === actionId ? { ...item, dueAt: dueDate.toISOString() } : item)
          .filter((item) => item.id !== actionId || matchesQueueFilters(item, dueDate))
          .sort((left, right) => new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime() || right.priority - left.priority || left.id.localeCompare(right.id)));
        setNextLeadId(result.nextLeadId ?? null);
        setAnnouncement(`${action.title}: ${new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(dueDate)}`);
      } catch {
        setError(t("requestFailed"));
        setAnnouncement("");
      }
    });
  }

  function postpone(action: CrmActionView) {
    const tomorrow = getCrmTomorrowAtSameLocalTime(new Date(), timeZone, new Date(action.dueAt));
    reschedule(action.id, formatCrmDateTimeInput(tomorrow, timeZone));
  }

  function callOutcomeLabel(outcome: NonNullable<CrmActionView["nextCall"]>["outcome"]): string {
    if (outcome === "closed") return callsT("closed");
    if (outcome === "not_closed") return callsT("notClosed");
    if (outcome === "awaiting_decision") return callsT("awaitingDecision");
    return callsT("pending");
  }

  function submitReschedule(event: FormEvent<HTMLFormElement>, actionId: string): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dueAt = data.get("dueAt");
    if (typeof dueAt === "string") reschedule(actionId, dueAt);
  }

  if (actions.length === 0) return <><p className="sr-only" role="status" aria-live="polite">{announcement}</p>{nextLeadId && <div className="sticker-card flex flex-wrap items-center justify-between gap-3 p-4" role="status"><p className="text-sm font-bold">{t("nextLeadReady")}</p><Button asChild variant="outline" className="min-h-11"><Link href={leadHref(nextLeadId)}>{t("openNextLead")}</Link></Button></div>}<p className="sticker-card p-8 text-center text-muted-foreground">{t("empty")}</p></>;

  const now = new Date();
  function renderAction(action: CrmActionView, featured = false) {
    const overdue = action.status === "open" && new Date(action.dueAt).getTime() < now.getTime();
    return (
        <article key={action.id} data-next-action={featured || undefined} className={`sticker-card flex flex-wrap items-center gap-3 p-4 ${featured ? "border-accent/40 bg-accent-soft/30" : ""}`}>
          {featured && <p className="w-full text-xs font-bold tracking-[0.06em] text-accent-text uppercase">{featuredActionLabel}</p>}
          <div className="min-w-0 flex-1">
            <Link href={leadHref(action.leadId)} className="inline-flex min-h-11 min-w-11 items-center font-bold underline-offset-2 hover:underline">{action.leadName}</Link>
            <p className="mt-1 font-bold">{action.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(action.category)}{action.responsibleName ? ` · ${action.responsibleName}` : ""}</p>
            <p className={overdue ? "mt-1 text-sm font-bold text-state-critical" : "mt-1 text-sm text-muted-foreground"}>{overdue && <>{t("overdue")} · </>}{t("due")}: {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(action.dueAt))}</p>
            {action.nextCall && <p className="mt-1 text-xs text-muted-foreground">{t("nextCall", { date: new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: action.nextCall.timeZone ?? timeZone }).format(new Date(action.nextCall.scheduledAt)), closer: action.nextCall.closer ?? t("noCloser"), outcome: callOutcomeLabel(action.nextCall.outcome) })}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {action.status === "open" ? <><Button type="button" variant="outline" size="sm" className="min-h-11" disabled={isPending} onClick={() => update(action.id, "completed")}>{t("complete")}</Button><Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={isPending} onClick={() => postpone(action)}>{t("postpone")}</Button></> : <span className={action.status === "completed" ? "text-sm font-bold text-state-healthy" : "text-sm font-bold text-muted-foreground"}>{t(action.status)}</span>}
            {action.status === "open" && <><details className="relative"><summary className="flex min-h-11 cursor-pointer list-none items-center rounded px-2 text-sm font-bold underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-accent/20">{t("reschedule")}</summary><form onSubmit={(event) => submitReschedule(event, action.id)} className="absolute right-0 z-10 mt-1 grid min-w-64 gap-2 rounded-[var(--radius-control)] border border-border bg-card p-3 shadow-lg"><label className="flex flex-col gap-1 text-xs font-bold">{t("due")}<input name="dueAt" type="datetime-local" defaultValue={formatCrmDateTimeInput(new Date(action.dueAt), timeZone)} className="min-h-11 rounded border border-border bg-background px-2 text-sm font-normal outline-none focus-visible:border-accent" /></label><Button type="submit" variant="outline" className="min-h-11" disabled={isPending}>{t("rescheduleSubmit")}</Button></form></details><Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={isPending} onClick={() => update(action.id, "cancelled")}>{t("cancel")}</Button></>}
          </div>
        </article>
      );
  }

  function renderActions(items: CrmActionView[]) {
    return items.map((action) => renderAction(action));
  }

  function dueGroup(action: CrmActionView, currentTime: Date, localDayBounds: { start: Date; end: Date }): DueGroup {
    const dueAt = new Date(action.dueAt);
    if (action.status === "open" && dueAt < currentTime) return "overdue";
    const { start, end } = localDayBounds;
    if (dueAt >= start && dueAt < end) return "today";
    return "upcoming";
  }

  function renderDueGroups(items: CrmActionView[], featuredId?: string) {
    const groups: Record<DueGroup, CrmActionView[]> = { overdue: [], today: [], upcoming: [] };
    const localDayBounds = getCrmLocalDayBounds(timeZone, now);
    for (const action of items) groups[dueGroup(action, now, localDayBounds)].push(action);
    return <div className="flex flex-col gap-4">{(["overdue", "today", "upcoming"] as const).map((group) => {
      const groupItems = groups[group].filter((action) => action.id !== featuredId);
      return groups[group].length > 0 ? <section key={group} aria-labelledby={`crm-due-${group}`}><h3 id={`crm-due-${group}`} className="mb-2 text-sm font-bold text-muted-foreground">{t(`dueGroups.${group}`)} · {groups[group].length}</h3><div className="flex flex-col gap-2">{renderActions(groupItems)}</div></section> : null;
    })}</div>;
  }

  const featuredAction = featureFirstAction ? actions[0] : undefined;
  const remainingActions = actions;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}
      <p className="sr-only" role="status" aria-live="polite">{announcement}</p>
      {nextLeadId && <div className="sticker-card flex flex-wrap items-center justify-between gap-3 p-4" role="status"><p className="text-sm font-bold">{t("nextLeadReady")}</p><Button asChild variant="outline" className="min-h-11"><Link href={leadHref(nextLeadId)}>{t("openNextLead")}</Link></Button></div>}
      {featuredAction && renderAction(featuredAction, true)}
      {remainingActions.length > 0 && (groupByDueDate ? renderDueGroups(remainingActions, featuredAction?.id) : renderActions(remainingActions))}
    </div>
  );
}
