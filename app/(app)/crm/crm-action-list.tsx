"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { CRM_ACTION_CATEGORIES, type CrmActionCategory, type CrmActionView } from "@/lib/crm/types";

import { completeActionAction } from "./crm-actions";

type DueGroup = "overdue" | "today" | "upcoming";

export function CrmActionList({ initialActions, groupedByCategory = false, groupByDueDate = false }: { initialActions: CrmActionView[]; groupedByCategory?: boolean; groupByDueDate?: boolean }) {
  const t = useTranslations("crm.actions");
  const locale = useLocale();
  const [actions, setActions] = useState(initialActions);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update(actionId: string, status: "completed" | "cancelled") {
    setError(null);
    startTransition(async () => {
      const result = await completeActionAction({ actionId, status });
      if (result.error) {
        setError(result.error);
        return;
      }
      setActions((items) => items.map((item) => item.id === actionId ? { ...item, status, completedAt: status === "completed" ? new Date().toISOString() : null } : item));
    });
  }

  if (actions.length === 0) return <p className="sticker-card p-8 text-center text-muted-foreground">{t("empty")}</p>;

  function renderActions(items: CrmActionView[]) {
    return items.map((action) => {
      const overdue = action.status === "open" && new Date(action.dueAt).getTime() < Date.now();
      return (
        <article key={action.id} className="sticker-card flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <Link href={`/crm/leads/${action.leadId}`} className="font-bold underline-offset-2 hover:underline">{action.leadName}</Link>
            <p className="mt-1 font-bold">{action.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t(action.category)}{action.responsibleName ? ` · ${action.responsibleName}` : ""}</p>
            <p className={overdue ? "mt-1 text-sm font-bold text-state-critical" : "mt-1 text-sm text-muted-foreground"}>{t("due")}: {new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(action.dueAt))}</p>
          </div>
          <div className="flex items-center gap-2">
            {action.status === "open" ? <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => update(action.id, "completed")}>{t("complete")}</Button> : <span className={action.status === "completed" ? "text-sm font-bold text-state-healthy" : "text-sm font-bold text-muted-foreground"}>{t(action.status)}</span>}
            {action.status === "open" && <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => update(action.id, "cancelled")}>{t("cancel")}</Button>}
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
    return <div className="flex flex-col gap-4">{(["overdue", "today", "upcoming"] as const).map((group) => groups[group].length > 0 ? <section key={group} aria-labelledby={`crm-due-${group}`}><h4 id={`crm-due-${group}`} className="mb-2 text-sm font-bold text-muted-foreground">{t(`dueGroups.${group}`)}</h4><div className="flex flex-col gap-2">{renderActions(groups[group])}</div></section> : null)}</div>;
  }

  if (groupedByCategory) {
      return <div className="flex flex-col gap-3">{error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}<div className="grid gap-4 lg:grid-cols-3">{CRM_ACTION_CATEGORIES.map((category: CrmActionCategory) => {
      const categoryActions = actions.filter((action) => action.category === category);
      return <section key={category} className="flex min-w-0 flex-col gap-3" aria-labelledby={`crm-action-category-${category}`}><h3 id={`crm-action-category-${category}`} className="text-lg font-bold">{t(category)}</h3>{categoryActions.length > 0 ? (groupByDueDate ? renderDueGroups(categoryActions) : renderActions(categoryActions)) : <p className="rounded-[var(--radius-control)] border border-dashed border-border p-4 text-sm text-muted-foreground">{t("empty")}</p>}</section>;
    })}</div></div>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}
      {renderActions(actions)}
    </div>
  );
}
