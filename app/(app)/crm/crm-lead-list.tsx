"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { ActiveCloser } from "@/lib/closers/types";
import type { Offer } from "@/lib/business/types";
import type { CrmLeadListItem } from "@/lib/crm/types";
import { CRM_LEAD_SOURCES } from "@/lib/crm/types";

import { CRM_OUTCOME_LABEL_KEYS } from "@/lib/crm/machine";
import { CrmLeadDrawer } from "./crm-lead-drawer";

type CrmSetter = { id: string; name: string; active: boolean };
const SOURCE_OPTIONS = CRM_LEAD_SOURCES;

function sourceKey(value: string): (typeof SOURCE_OPTIONS)[number] | null {
  return SOURCE_OPTIONS.includes(value as (typeof SOURCE_OPTIONS)[number]) ? value as (typeof SOURCE_OPTIONS)[number] : null;
}

export function CrmLeadList({ leads, setters, offers, closers, canAssign }: { leads: CrmLeadListItem[]; setters: CrmSetter[]; offers: Offer[]; closers: ActiveCloser[]; canAssign: boolean }) {
  const t = useTranslations("crm");
  const [drawerLead, setDrawerLead] = useState<CrmLeadListItem | null>(null);

  function sourceLabel(source: string): string {
    const key = sourceKey(source);
    return key ? t(`leads.sourceOptions.${key}`) : t("leads.sourceOptions.autre");
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-border bg-card p-0 md:block">
        <table className="w-full min-w-[680px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs font-bold text-muted-foreground"><th className="px-4 py-3">{t("leads.platform")}</th><th className="px-4 py-3">{t("leads.title")}</th><th className="px-4 py-3">{t("pipeline.responsible")}</th><th className="px-4 py-3">{t("pipeline.outcome")}</th><th className="px-4 py-3">{t("leads.created")}</th><th className="px-4 py-3"><span className="sr-only">{t("leads.open")}</span></th></tr></thead>
          <tbody>{leads.map((lead) => <tr key={lead.id} className="border-b border-border last:border-0"><td className="px-4 py-3 font-bold">{lead.platform ? sourceLabel(lead.platform) : sourceLabel(lead.source)}</td><td className="px-4 py-3"><button type="button" onClick={() => setDrawerLead(lead)} className="rounded text-left outline-none focus-visible:ring-3 focus-visible:ring-accent/20"><span className="font-bold underline-offset-2 hover:underline">{lead.displayName}</span><span className="block text-xs text-muted-foreground">{lead.normalizedHandle ? `@${lead.normalizedHandle}` : lead.canonicalProfileUrl}</span></button></td><td className="px-4 py-3 text-muted-foreground">{lead.responsibleSetterName ?? t("detail.unassigned")}</td><td className="px-4 py-3 font-bold">{t(CRM_OUTCOME_LABEL_KEYS[lead.outcome])}</td><td className="px-4 py-3 text-muted-foreground">{new Date(lead.createdAt).toLocaleDateString()}</td><td className="px-4 py-3"><Button type="button" variant="outline" size="sm" onClick={() => setDrawerLead(lead)}>{t("leads.open")}</Button></td></tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-2 md:hidden">
        {leads.map((lead) => <button key={lead.id} type="button" onClick={() => setDrawerLead(lead)} className="rounded-[var(--radius-card)] border border-border bg-card p-4 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-accent/20"><div className="flex items-start justify-between gap-3"><span className="font-bold">{lead.displayName}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold">{t(CRM_OUTCOME_LABEL_KEYS[lead.outcome])}</span></div><p className="mt-1 text-xs text-muted-foreground">{lead.normalizedHandle ? `@${lead.normalizedHandle}` : sourceLabel(lead.source)} · {lead.responsibleSetterName ?? t("detail.unassigned")}</p>{lead.nextAction && <p className="mt-2 text-xs font-bold text-accent-text">{lead.nextAction.title}</p>}</button>)}
      </div>
      <CrmLeadDrawer lead={drawerLead} open={drawerLead !== null} onOpenChange={(open) => !open && setDrawerLead(null)} setters={setters} offers={offers} closers={closers} canAssign={canAssign} />
    </>
  );
}
