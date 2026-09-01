"use client";

import Link from "next/link";
import { useState, useTransition, type DragEvent } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { ActiveCloser } from "@/lib/closers/types";
import type { Offer } from "@/lib/business/types";
import { CRM_LEAD_SOURCES, CRM_LEAD_STAGES, type CrmLeadListItem, type CrmLeadSource, type CrmLeadStage } from "@/lib/crm/types";
import { CRM_STAGE_LABEL_KEYS, CRM_OUTCOME_LABEL_KEYS } from "@/lib/crm/machine";

import { changeStageAction } from "./crm-actions";
import { CrmLeadDrawer } from "./crm-lead-drawer";

export function CrmStageBoard({ initialLeads, setters, offers, closers, canAssign }: { initialLeads: CrmLeadListItem[]; setters: Array<{ id: string; name: string; active: boolean }>; offers: Offer[]; closers: ActiveCloser[]; canAssign: boolean }) {
  const t = useTranslations("crm");
  const [leads, setLeads] = useState(initialLeads);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [selectedStage, setSelectedStage] = useState<CrmLeadStage>(CRM_LEAD_STAGES[0]);
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [drawerLead, setDrawerLead] = useState<CrmLeadListItem | null>(null);

  function sourceLabel(source: string): string {
    return CRM_LEAD_SOURCES.includes(source as CrmLeadSource) ? t(`sources.${source}`) : t("sources.autre");
  }

  function move(leadId: string, stage: CrmLeadStage) {
    const previous = leads;
    setError(null);
    setLeads((items) => items.map((lead) => lead.id === leadId ? { ...lead, stage } : lead));
    startTransition(async () => {
      const result = await changeStageAction({ leadId, stage });
      if (result.error) {
        setLeads(previous);
        setError(result.error);
      }
    });
  }

  function startDrag(event: DragEvent<HTMLElement>, leadId: string) {
    setDraggedLeadId(leadId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", leadId);
  }

  function dropOnStage(event: DragEvent<HTMLElement>, stage: CrmLeadStage) {
    event.preventDefault();
    const leadId = event.dataTransfer.getData("text/plain") || draggedLeadId;
    setDraggedLeadId(null);
    if (leadId) move(leadId, stage);
  }

  function stageColumn(stage: CrmLeadStage, viewport: "mobile" | "desktop") {
    const stageLeads = leads.filter((lead) => lead.stage === stage);
    const headingId = `crm-stage-${stage}-${viewport}`;
    return <section key={`${viewport}-${stage}`} className="min-w-[250px] rounded-[var(--radius-card)] border border-border bg-surface-sunken p-3" aria-labelledby={headingId} onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropOnStage(event, stage)}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-sm font-bold">{t(CRM_STAGE_LABEL_KEYS[stage])}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">{stageLeads.length}</span>
      </div>
      <div className="mt-3 flex min-h-24 flex-col gap-2">
        {stageLeads.map((lead) => <article key={lead.id} draggable={!isPending} onDragStart={(event) => startDrag(event, lead.id)} onDragEnd={() => setDraggedLeadId(null)} className={`rounded-[var(--radius-control)] border border-border bg-card p-3 shadow-sm ${draggedLeadId === lead.id ? "opacity-50" : ""}`}>
          <button type="button" onClick={() => setDrawerLead(lead)} className="block w-full rounded text-left outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
            <p className="font-bold">{lead.displayName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{lead.platform ? t(`sources.${lead.platform}`) : sourceLabel(lead.source)}</p>
            {lead.responsibleSetterName && <p className="mt-1 text-xs text-muted-foreground">{t("pipeline.responsible")}: {lead.responsibleSetterName}</p>}
            {lead.outcome !== "none" && <p className="mt-2 text-xs font-bold text-accent-text">{t(CRM_OUTCOME_LABEL_KEYS[lead.outcome])}</p>}
          </button>
          <label className="mt-3 flex flex-col gap-1 text-xs font-bold text-muted-foreground">
            {t("pipeline.move")}
            <select value={lead.stage} disabled={isPending} onChange={(event) => move(lead.id, event.target.value as CrmLeadStage)} className="min-h-8 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-accent">
              {CRM_LEAD_STAGES.map((option) => <option key={option} value={option}>{t(CRM_STAGE_LABEL_KEYS[option])}</option>)}
            </select>
          </label>
        </article>)}
        {stageLeads.length === 0 && <p className="py-5 text-center text-xs text-muted-foreground">{t("pipeline.empty")}</p>}
      </div>
    </section>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}
      <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden" role="tablist" aria-label={t("pipeline.stageSelector")}>
        {CRM_LEAD_STAGES.map((stage) => <Button key={stage} type="button" role="tab" aria-selected={selectedStage === stage} variant={selectedStage === stage ? "default" : "outline"} onClick={() => setSelectedStage(stage)}>{t(CRM_STAGE_LABEL_KEYS[stage])}</Button>)}
      </div>
      <div className="lg:hidden">{stageColumn(selectedStage, "mobile")}</div>
      <div className="hidden gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-5" tabIndex={0}>{CRM_LEAD_STAGES.map((stage) => stageColumn(stage, "desktop"))}</div>
      <p className="text-xs text-muted-foreground lg:block">{t("pipeline.dragHint")}</p>
      <Button asChild variant="outline" className="self-start"><Link href="/crm/leads">{t("today.openPipeline")}</Link></Button>
      <CrmLeadDrawer lead={drawerLead} open={drawerLead !== null} onOpenChange={(open) => !open && setDrawerLead(null)} setters={setters} offers={offers} closers={closers} canAssign={canAssign} />
    </div>
  );
}
