"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { CRM_ACTION_CATEGORIES, type CrmActionCategory, type CrmActionView } from "@/lib/crm/types";

import { completeActionAction, rescheduleActionAction } from "./crm-actions";

type DueGroup = "overdue" | "today" | "upcoming";
type QueueFilters = { category?: CrmActionCategory; relanceOnly?: boolean; overdueOnly?: boolean; dueTodayOnly?: boolean };

export function CrmActionList({ initialActions, groupedByCategory = false, groupByDueDate = false, nextActionFilters }: { initialActions: CrmActionView[]; groupedByCategory?: boolean; groupByDueDate?: boolean; nextActionFilters?: QueueFilters }) {
  const t = useTranslations("crm.actions");
  const callsT = useTranslations("crm.calls");
  const locale = useLocale();
  const [actions, setActions] = useState(initialActions);
  const [error, setError] = useState<string | null>(null);
  const [nextLeadId, setNextLeadId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function matchesQueueFilters(action: CrmActionView, dueAt = new Date(action.dueAt)): boolean {
    if (!nextActionFilters) return true;
    if (nextActionFilters.category && action.category !== nextActionFilters.category) return false;
    if (nextActionFilters.relanceOnly && action.type !== "follow_up" && action.type !== "no_show_follow_up") return false;
    if (nextActionFilters.overdueOnly && !(action.status === "open" && dueAt.getTime() < Date.now())) return false;
    if (nextActionFilters.dueTodayOnly) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
      if (!(action.status === "open" && dueAt.getTime() >= start && dueAt.getTime() < end)) return false;
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
    setError(null);
    startTransition(async () => {
      try {
        const result = await completeActionAction({ actionId, status, idempotencyKey: `crm-action:${actionId}:${status}`, nextFilters: nextActionFilters });
        applyResult(actionId, result);
      } catch {
        setError(t("requestFailed"));
      }
    });
  }

  function localDateTimeValue(value: Date): string {
    const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }

  function reschedule(actionId: string, dueAt: string) {
    const dueDate = new Date(dueAt);
    if (Number.isNaN(dueDate.getTime())) {
      setError(t("invalidDue"));
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const result = await rescheduleActionAction({ actionId, dueAt: dueDate.toISOString(), idempotencyKey: `crm-reschedule:${actionId}:${dueDate.toISOString()}`, nextFilters: nextActionFilters });
        if (result.error) {
          setError(result.error);
          return;
        }
        setActions((items) => items.map((item) => item.id === actionId ? { ...item, dueAt: dueDate.toISOString() } : item).filter((item) => item.id !== actionId || matchesQueueFilters(item, dueDate)));
        setNextLeadId(result.nextLeadId ?? null);
      } catch {
        setError(t("requestFailed"));
      }
    });
  }

  function postpone(action: CrmActionView) {
    const originalDueAt = new Date(action.dueAt);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(originalDueAt.getHours(), originalDueAt.getMinutes(), 0, 0);
    reschedule(action.id, tomorrow.toISOString());
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

  if (actions.length === 0) return <>{nextLeadId && <div className="sticker-card flex flex-wrap items-center justify-between gap-3 p-4" role="status"><p className="text-sm font-bold">{t("nextLeadReady")}</p><Button asChild variant="outline" className="min-h-11"><Link href={`/crm/leads/${nextLeadId}`}>{t("openNextLead")}</Link></Button></div>}<p className="sticker-card p-8 text-center text-muted-foreground">{t("empty")}</p></>;

  function renderActions(items: CrmActionView[]) {
    return items.map((action) => {
      const overdue = action.status === "open" && new Date(action.dueAt).getTime() < Date.now();
      return (
        <article key={action.id} className="sticker-card flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <Link href={`/crm/leads/${action.leadId}`} className="inline-flex min-h-11 items-center font-bold underline-offset-2 hover:underline">{action.leadName}</Link>
            <p className="mt-1 font-bold">{action.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(action.category)}{action.responsibleName ? ` · ${action.responsibleName}` : ""}</p>
            <p className={overdue ? "mt-1 text-sm font-bold text-state-critical" : "mt-1 text-sm text-muted-foreground"}>{t("due")}: {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(action.dueAt))}</p>
            {action.nextCall && <p className="mt-1 text-xs text-muted-foreground">{t("nextCall", { date: new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: action.nextCall.timeZone ?? undefined }).format(new Date(action.nextCall.scheduledAt)), closer: action.nextCall.closer ?? t("noCloser"), outcome: callOutcomeLabel(action.nextCall.outcome) })}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {action.status === "open" ? <><Button type="button" variant="outline" size="sm" className="min-h-11" disabled={isPending} onClick={() => update(action.id, "completed")}>{t("complete")}</Button><Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={isPending} onClick={() => postpone(action)}>{t("postpone")}</Button></> : <span className={action.status === "completed" ? "text-sm font-bold text-state-healthy" : "text-sm font-bold text-muted-foreground"}>{t(action.status)}</span>}
            {action.status === "open" && <><details className="relative"><summary className="flex min-h-11 cursor-pointer list-none items-center rounded px-2 text-sm font-bold underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-accent/20">{t("reschedule")}</summary><form onSubmit={(event) => submitReschedule(event, action.id)} className="absolute right-0 z-10 mt-1 grid min-w-64 gap-2 rounded-[var(--radius-control)] border border-border bg-card p-3 shadow-lg"><label className="flex flex-col gap-1 text-xs font-bold">{t("due")}<input name="dueAt" type="datetime-local" defaultValue={localDateTimeValue(new Date(action.dueAt))} className="min-h-11 rounded border border-border bg-background px-2 text-sm font-normal outline-none focus-visible:border-accent" /></label><Button type="submit" variant="outline" className="min-h-11" disabled={isPending}>{t("rescheduleSubmit")}</Button></form></details><Button type="button" variant="ghost" size="sm" className="min-h-11" disabled={isPending} onClick={() => update(action.id, "cancelled")}>{t("cancel")}</Button></>}
          </div>
        </article>
      );
    });
  }

  function dueGroup(action: CrmActionView): DueGroup {
    const dueAt = new Date(action.dueAt);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    if (dueAt < startOfToday) return "overdue";
    if (dueAt < startOfTomorrow) return "today";
    return "upcoming";
  }

  function renderDueGroups(items: CrmActionView[]) {
    const groups: Record<DueGroup, CrmActionView[]> = { overdue: [], today: [], upcoming: [] };
    for (const action of items) groups[dueGroup(action)].push(action);
    return <div className="flex flex-col gap-4">{(["overdue", "today", "upcoming"] as const).map((group) => groups[group].length > 0 ? <section key={group} aria-labelledby={`crm-due-${group}`}><h4 id={`crm-due-${group}`} className="mb-2 text-sm font-bold text-muted-foreground">{t(`dueGroups.${group}`)} · {groups[group].length}</h4><div className="flex flex-col gap-2">{renderActions(groups[group])}</div></section> : null)}</div>;
  }

  if (groupedByCategory) {
      return <div className="flex flex-col gap-3">{error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}{nextLeadId && <div className="sticker-card flex flex-wrap items-center justify-between gap-3 p-4" role="status"><p className="text-sm font-bold">{t("nextLeadReady")}</p><Button asChild variant="outline" className="min-h-11"><Link href={`/crm/leads/${nextLeadId}`}>{t("openNextLead")}</Link></Button></div>}<div className="grid gap-4 lg:grid-cols-3">{CRM_ACTION_CATEGORIES.map((category: CrmActionCategory) => {
      const categoryActions = actions.filter((action) => action.category === category);
      return <section key={category} className="flex min-w-0 flex-col gap-3" aria-labelledby={`crm-action-category-${category}`}><h3 id={`crm-action-category-${category}`} className="text-lg font-bold">{t(category)}</h3>{categoryActions.length > 0 ? (groupByDueDate ? renderDueGroups(categoryActions) : renderActions(categoryActions)) : <p className="rounded-[var(--radius-control)] border border-dashed border-border p-4 text-sm text-muted-foreground">{t("empty")}</p>}</section>;
    })}</div></div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}
      {nextLeadId && <div className="sticker-card flex flex-wrap items-center justify-between gap-3 p-4" role="status"><p className="text-sm font-bold">{t("nextLeadReady")}</p><Button asChild variant="outline" className="min-h-11"><Link href={`/crm/leads/${nextLeadId}`}>{t("openNextLead")}</Link></Button></div>}
      {renderActions(actions)}
    </div>
  );
}
