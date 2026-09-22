"use client";

import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { useLocale, useTranslations } from "next-intl";

import type { ActiveCloser } from "@/lib/closers/types";
import type { Offer } from "@/lib/business/types";
import type { CrmLeadListItem } from "@/lib/crm/types";
import { CRM_LEAD_SOURCES } from "@/lib/crm/types";
import { ChevronRight } from "lucide-react";

import { CRM_OUTCOME_LABEL_KEYS } from "@/lib/crm/machine";
import { CrmLeadDrawer } from "./crm-lead-drawer";
import { CrmProfileLink } from "./crm-profile-link";

type CrmSetter = { id: string; name: string; active: boolean };
const SOURCE_OPTIONS = CRM_LEAD_SOURCES;

function sourceKey(value: string): (typeof SOURCE_OPTIONS)[number] | null {
  return SOURCE_OPTIONS.includes(value as (typeof SOURCE_OPTIONS)[number]) ? value as (typeof SOURCE_OPTIONS)[number] : null;
}

function isNestedInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("a, button, input, select, textarea") !== null;
}

export function CrmLeadList({ leads, setters, offers, closers, canAssign, canManagePipeline }: { leads: CrmLeadListItem[]; setters: CrmSetter[]; offers: Offer[]; closers: ActiveCloser[]; canAssign: boolean; canManagePipeline: boolean }) {
  const t = useTranslations("crm");
  const locale = useLocale();
  const [drawerLead, setDrawerLead] = useState<CrmLeadListItem | null>(null);
  const createdDateFormatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });

  function sourceLabel(source: string): string {
    const key = sourceKey(source);
    return key ? t(`leads.sourceOptions.${key}`) : t("leads.sourceOptions.autre");
  }

  function handleLeadClick(event: MouseEvent<HTMLElement>, lead: CrmLeadListItem): void {
    if (isNestedInteractiveTarget(event.target)) return;
    setDrawerLead(lead);
  }

  function handleLeadKeyDown(event: KeyboardEvent<HTMLElement>, lead: CrmLeadListItem): void {
    if (isNestedInteractiveTarget(event.target)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setDrawerLead(lead);
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-border bg-card p-0 md:block">
        <table className="w-full min-w-[840px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs font-bold text-muted-foreground"><th className="px-4 py-3">{t("leads.platform")}</th><th className="px-4 py-3">{t("leads.title")}</th><th className="px-4 py-3">{t("pipeline.responsible")}</th><th className="px-4 py-3">{t("pipeline.outcome")}</th><th className="px-4 py-3">{t("leads.nextAction")}</th><th className="px-4 py-3">{t("leads.created")}</th><th className="w-10 px-4 py-3"><span className="sr-only">{t("leads.open")}</span></th></tr></thead>
          <tbody>{leads.map((lead) => <tr key={lead.id} role="link" tabIndex={0} aria-label={`${t("calls.openLead")}: ${lead.displayName}`} onClick={(event) => handleLeadClick(event, lead)} onKeyDown={(event) => handleLeadKeyDown(event, lead)} className="group cursor-pointer border-b border-border outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-2 focus-visible:outline-accent focus-visible:outline-offset-[-2px] last:border-0"><td className="px-4 py-3 font-bold">{lead.platform ? sourceLabel(lead.platform) : sourceLabel(lead.source)}</td><td className="px-4 py-3"><div className="flex min-w-0 items-center gap-1"><div className="min-w-0"><span className="block truncate font-bold">{lead.displayName}</span><span className="block truncate text-xs text-muted-foreground">{lead.normalizedHandle ? `@${lead.normalizedHandle}` : lead.canonicalProfileUrl}</span></div><CrmProfileLink href={lead.canonicalProfileUrl} label={t("leads.openProfile")} iconOnly /></div></td><td className="px-4 py-3 text-muted-foreground">{lead.responsibleSetterName ?? t("detail.unassigned")}</td><td className="px-4 py-3 font-bold">{lead.contactState === "new" ? t("detail.newLead") : lead.respondedAt ? t("detail.responded") : t(CRM_OUTCOME_LABEL_KEYS[lead.outcome])}</td><td className="max-w-56 px-4 py-3 text-muted-foreground">{lead.nextAction?.title ?? t("leads.noNextAction")}</td><td className="px-4 py-3 text-muted-foreground">{createdDateFormatter.format(new Date(lead.createdAt))}</td><td className="px-4 py-3 text-right"><ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent-text" aria-hidden="true" /></td></tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-2 md:hidden">
        {leads.map((lead) => <article key={lead.id} role="link" tabIndex={0} aria-label={`${t("calls.openLead")}: ${lead.displayName}`} onClick={(event) => handleLeadClick(event, lead)} onKeyDown={(event) => handleLeadKeyDown(event, lead)} className="group cursor-pointer rounded-[var(--radius-card)] border border-border bg-card p-4 outline-none transition-colors hover:border-border-hover hover:bg-muted/40 focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20"><div className="flex items-start gap-2"><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><span className="truncate font-bold">{lead.displayName}</span><span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{lead.contactState === "new" ? t("detail.newLead") : lead.respondedAt ? t("detail.responded") : t(CRM_OUTCOME_LABEL_KEYS[lead.outcome])}</span></div><p className="mt-1 truncate text-xs text-muted-foreground">{lead.normalizedHandle ? `@${lead.normalizedHandle}` : sourceLabel(lead.source)} · {lead.responsibleSetterName ?? t("detail.unassigned")}</p></div><ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-accent-text" aria-hidden="true" /><CrmProfileLink href={lead.canonicalProfileUrl} label={t("leads.openProfile")} iconOnly /></div>{lead.nextAction && <p className="mt-2 text-xs font-bold text-accent-text">{lead.nextAction.title}</p>}{lead.nextCall && <p className="mt-1 text-xs text-muted-foreground">{t("detail.nextCall")}: {new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short", timeZone: lead.nextCall.timeZone ?? undefined }).format(new Date(lead.nextCall.scheduledAt))}</p>}</article>)}
      </div>
      <CrmLeadDrawer lead={drawerLead} open={drawerLead !== null} onOpenChange={(open) => !open && setDrawerLead(null)} setters={setters} offers={offers} closers={closers} canAssign={canAssign} canManagePipeline={canManagePipeline} />
    </>
  );
}
