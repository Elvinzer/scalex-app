"use client";

import Link from "next/link";
import { useState, useTransition, type DragEvent, type FormEvent } from "react";
import { useTranslations } from "next-intl";

import { CrmSourceBadge } from "@/components/crm/crm-source-badge";
import { Button } from "@/components/ui/button";
import type { ActiveCloser } from "@/lib/closers/types";
import type { Offer } from "@/lib/business/types";
import { CRM_LEAD_SOURCES, CRM_LEAD_STAGES, type CrmLeadListItem, type CrmLeadSource, type CrmLeadStage } from "@/lib/crm/types";
import type { CrmPipelineStagePages } from "@/lib/crm/queries";
import { CRM_STAGE_LABEL_KEYS, CRM_OUTCOME_LABEL_KEYS } from "@/lib/crm/machine";
import { CRM_PIPELINE_STAGE_PAGE_SIZE } from "@/lib/crm/lead-pagination";

import { changeStageAction, getCrmPipelineStagePageAction, getCrmPipelineStagePagesAction } from "./crm-actions";
import { CrmLeadDrawer } from "./crm-lead-drawer";
import { CrmProfileLink } from "./crm-profile-link";

type PipelineSourceFilter = CrmLeadSource | "all";
type PipelineStagePageState = CrmPipelineStagePages[CrmLeadStage] & { nextOffset: number };
type PipelinePagesState = Record<CrmLeadStage, PipelineStagePageState>;

function toPipelinePagesState(pages: CrmPipelineStagePages): PipelinePagesState {
  return Object.fromEntries(CRM_LEAD_STAGES.map((stage) => [stage, {
    ...pages[stage],
    nextOffset: pages[stage].leads.length,
  }])) as PipelinePagesState;
}

function moveLeadInPages(pages: PipelinePagesState, leadId: string, nextStage: CrmLeadStage): PipelinePagesState {
  const currentStage = CRM_LEAD_STAGES.find((stage) => pages[stage].leads.some((lead) => lead.id === leadId));
  if (!currentStage || currentStage === nextStage) return pages;

  const currentPage = pages[currentStage];
  const nextPage = pages[nextStage];
  const lead = currentPage.leads.find((item) => item.id === leadId);
  if (!lead) return pages;

  const movedLead = { ...lead, stage: nextStage };
  const currentLeads = currentPage.leads.filter((item) => item.id !== leadId);
  const nextLeads = [movedLead, ...nextPage.leads.filter((item) => item.id !== leadId)]
    .slice(0, Math.max(nextPage.leads.length, 1));
  const addedToLoadedPage = nextLeads.length > nextPage.leads.length;

  return {
    ...pages,
    [currentStage]: {
      ...currentPage,
      leads: currentLeads,
      totalCount: Math.max(0, currentPage.totalCount - 1),
      nextOffset: Math.max(currentPage.nextOffset - 1, currentLeads.length),
    },
    [nextStage]: {
      ...nextPage,
      leads: nextLeads,
      totalCount: nextPage.totalCount + 1,
      nextOffset: nextPage.nextOffset + (addedToLoadedPage ? 1 : 0),
    },
  };
}

export function CrmStageBoard({ initialPages, setters, offers, closers, canAssign, canManagePipeline }: { initialPages: CrmPipelineStagePages; setters: Array<{ id: string; name: string; active: boolean }>; offers: Offer[]; closers: ActiveCloser[]; canAssign: boolean; canManagePipeline: boolean }) {
  const t = useTranslations("crm");
  const [pages, setPages] = useState(() => toPipelinePagesState(initialPages));
  const [selectedStage, setSelectedStage] = useState<CrmLeadStage>(CRM_LEAD_STAGES[0]);
  const [selectedSource, setSelectedSource] = useState<PipelineSourceFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [searchError, setSearchError] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [loadingStages, setLoadingStages] = useState<Set<CrmLeadStage>>(() => new Set());
  const [stageLoadErrors, setStageLoadErrors] = useState<Set<CrmLeadStage>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [draggedLeadId, setDraggedLeadId] = useState<string | null>(null);
  const [drawerLead, setDrawerLead] = useState<CrmLeadListItem | null>(null);

  function sourceLabel(source: string): string {
    const normalizedSource = CRM_LEAD_SOURCES.find((candidate) => candidate === source);
    return normalizedSource ? t(`sources.${normalizedSource}`) : t("sources.autre");
  }

  const hasAppliedFilters = Boolean(appliedSearch) || selectedSource !== "all";

  async function applyFilters(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSearching || isPending || loadingStages.size > 0) return;
    const nextSearch = searchTerm.trim();
    setSearchError(false);
    setIsSearching(true);
    try {
      const result = await getCrmPipelineStagePagesAction({
        search: nextSearch || undefined,
        source: selectedSource === "all" ? undefined : selectedSource,
      });
      if (result.state !== "ready") {
        setSearchError(true);
        return;
      }
      setPages(toPipelinePagesState(result.pages));
      setAppliedSearch(nextSearch);
      setStageLoadErrors(new Set());
    } catch {
      setSearchError(true);
    } finally {
      setIsSearching(false);
    }
  }

  async function loadMore(stage: CrmLeadStage): Promise<void> {
    const page = pages[stage];
    if (loadingStages.has(stage) || page.leads.length >= page.totalCount || isSearching || isPending) return;

    setLoadingStages((current) => new Set(current).add(stage));
    setStageLoadErrors((current) => {
      const next = new Set(current);
      next.delete(stage);
      return next;
    });
    try {
      const result = await getCrmPipelineStagePageAction({
        stage,
        search: appliedSearch || undefined,
        source: selectedSource === "all" ? undefined : selectedSource,
        offset: page.nextOffset,
      });
      if (result.state !== "ready") {
        setStageLoadErrors((current) => new Set(current).add(stage));
        return;
      }
      setPages((current) => {
        const currentPage = current[stage];
        const knownIds = new Set(currentPage.leads.map((lead) => lead.id));
        const additions = result.leads.filter((lead) => !knownIds.has(lead.id));
        return {
          ...current,
          [stage]: {
            leads: [...currentPage.leads, ...additions],
            totalCount: result.totalCount,
            nextOffset: currentPage.nextOffset + result.leads.length,
          },
        };
      });
    } catch {
      setStageLoadErrors((current) => new Set(current).add(stage));
    } finally {
      setLoadingStages((current) => {
        const next = new Set(current);
        next.delete(stage);
        return next;
      });
    }
  }

  function applyDrawerStageChange(leadId: string, stage: CrmLeadStage): void {
    setPages((current) => moveLeadInPages(current, leadId, stage));
    setDrawerLead((current) => current ? { ...current, stage } : null);
  }

  function removeFromPipeline(leadId: string): void {
    setPages((current) => {
      const stage = CRM_LEAD_STAGES.find((candidate) => current[candidate].leads.some((lead) => lead.id === leadId));
      if (!stage) return current;
      const page = current[stage];
      const leads = page.leads.filter((lead) => lead.id !== leadId);
      return {
        ...current,
        [stage]: {
          ...page,
          leads,
          totalCount: Math.max(0, page.totalCount - 1),
          nextOffset: Math.max(page.nextOffset - 1, leads.length),
        },
      };
    });
    setDrawerLead((current) => current?.id === leadId ? null : current);
  }

  function move(leadId: string, stage: CrmLeadStage): void {
    if (isSearching || isPending || loadingStages.size > 0) return;
    const previousPages = pages;
    setError(null);
    setPages((current) => moveLeadInPages(current, leadId, stage));
    startTransition(async () => {
      try {
        const result = await changeStageAction({ leadId, stage });
        if (result.error) {
          setPages(previousPages);
          setError(result.error);
          return;
        }
        setDrawerLead((current) => current?.id === leadId ? { ...current, stage } : current);
      } catch {
        setPages(previousPages);
        setError(t("errors.requestFailed"));
      }
    });
  }

  function startDrag(event: DragEvent<HTMLElement>, leadId: string): void {
    setDraggedLeadId(leadId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", leadId);
  }

  function dropOnStage(event: DragEvent<HTMLElement>, stage: CrmLeadStage): void {
    event.preventDefault();
    const leadId = event.dataTransfer.getData("text/plain") || draggedLeadId;
    setDraggedLeadId(null);
    if (leadId) move(leadId, stage);
  }

  function stageColumn(stage: CrmLeadStage, viewport: "mobile" | "desktop") {
    const page = pages[stage];
    const headingId = `crm-stage-${stage}-${viewport}`;
    const isStageLoading = loadingStages.has(stage);
    const hasStageError = stageLoadErrors.has(stage);
    return <section key={`${viewport}-${stage}`} className="flex min-w-[240px] flex-col rounded-[var(--radius-card)] border border-border bg-surface-sunken p-3" aria-labelledby={headingId} onDragOver={viewport === "desktop" ? (event) => event.preventDefault() : undefined} onDrop={viewport === "desktop" ? (event) => dropOnStage(event, stage) : undefined}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={headingId} className="text-sm font-bold">{t(CRM_STAGE_LABEL_KEYS[stage])}</h2>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">{page.totalCount}</span>
      </div>
      <div className="mt-3 flex min-h-24 flex-col gap-2">
        {page.leads.map((lead) => <article key={lead.id} draggable={viewport === "desktop" && !isPending} onDragStart={viewport === "desktop" ? (event) => startDrag(event, lead.id) : undefined} onDragEnd={viewport === "desktop" ? () => setDraggedLeadId(null) : undefined} className={`rounded-[var(--radius-control)] border border-border bg-card p-3 shadow-sm ${draggedLeadId === lead.id ? "opacity-50" : ""}`}>
          <div className="flex items-start gap-2">
            <button type="button" onClick={() => setDrawerLead(lead)} className="inline-flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded text-left outline-none focus-visible:ring-3 focus-visible:ring-accent/20">
              <p className="font-bold">{lead.displayName}</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {lead.platform && lead.platform === lead.source ? <CrmSourceBadge source={lead.source} label={`${t("leads.channelAndSourceShort")}: ${sourceLabel(lead.source)}`} /> : <>
                  {lead.platform && <CrmSourceBadge source={lead.platform} label={`${t("leads.channelShort")}: ${sourceLabel(lead.platform)}`} />}
                  <CrmSourceBadge source={lead.source} label={`${t("leads.sourceShort")}: ${sourceLabel(lead.source)}`} />
                </>}
              </div>
              {lead.responsibleSetterName && <p className="mt-1 text-xs text-muted-foreground">{t("pipeline.responsible")}: {lead.responsibleSetterName}</p>}
              {lead.outcome !== "none" && <p className="mt-2 text-xs font-bold text-accent-text">{t(CRM_OUTCOME_LABEL_KEYS[lead.outcome])}</p>}
            </button>
            <CrmProfileLink href={lead.canonicalProfileUrl} label={t("leads.openProfile")} iconOnly />
          </div>
          <label className="mt-3 flex flex-col gap-1 text-xs font-bold text-muted-foreground">
            {t("pipeline.move")}
            <select aria-label={`${t("pipeline.move")}: ${lead.displayName}`} value={lead.stage} disabled={isPending || isSearching || loadingStages.size > 0} onChange={(event) => {
              const nextStage = CRM_LEAD_STAGES.find((candidate) => candidate === event.target.value);
              if (nextStage) move(lead.id, nextStage);
            }} className="min-h-11 rounded border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-accent">
              {CRM_LEAD_STAGES.map((option) => <option key={option} value={option}>{t(CRM_STAGE_LABEL_KEYS[option])}</option>)}
            </select>
          </label>
        </article>)}
        {page.leads.length === 0 && <p className="py-5 text-center text-xs text-muted-foreground">{hasAppliedFilters ? t("pipeline.emptyFiltered") : t("pipeline.empty")}</p>}
      </div>
      {page.leads.length < page.totalCount && <div className="mt-3 flex flex-col items-center gap-2">
        {hasStageError && <p className="text-center text-xs text-destructive" role="alert">{t("pipeline.loadFailed")}</p>}
        <Button type="button" variant="outline" className="min-h-11 w-full" onClick={() => void loadMore(stage)} disabled={isStageLoading || isSearching || isPending} aria-busy={isStageLoading}>
          {isStageLoading ? t("pipeline.loading") : hasStageError ? t("pipeline.retry") : t("pipeline.loadMore", { count: Math.min(CRM_PIPELINE_STAGE_PAGE_SIZE, page.totalCount - page.leads.length) })}
        </Button>
      </div>}
    </section>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}
      <form onSubmit={(event) => void applyFilters(event)} className="grid gap-3 rounded-[var(--radius-card)] border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.45fr)] sm:items-end">
        <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-muted-foreground">
          <span>{t("pipeline.search")}</span>
          <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} disabled={isSearching || isPending || loadingStages.size > 0} placeholder={t("pipeline.searchPlaceholder")} className="min-h-11 rounded border border-border bg-background px-3 text-sm font-normal text-foreground outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" />
        </label>
        <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-muted-foreground">
          <span>{t("leads.sourceFilter")}</span>
          <select value={selectedSource} disabled={isSearching || isPending || loadingStages.size > 0} onChange={(event) => setSelectedSource(CRM_LEAD_SOURCES.find((source) => source === event.target.value) ?? "all")} className="min-h-11 rounded border border-border bg-background px-2 text-sm font-normal text-foreground outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20">
            <option value="all">{t("leads.allSources")}</option>
            {CRM_LEAD_SOURCES.map((source) => <option key={source} value={source}>{sourceLabel(source)}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="outline" className="min-h-11" disabled={isSearching || isPending || loadingStages.size > 0} aria-busy={isSearching}>{isSearching ? t("pipeline.searching") : t("pipeline.applyFilters")}</Button>
        </div>
        {searchError && <p className="text-sm text-destructive sm:col-span-2" role="alert">{t("pipeline.searchFailed")}</p>}
      </form>
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain pb-2 lg:hidden" role="group" aria-label={t("pipeline.stageSelector")}>
        {CRM_LEAD_STAGES.map((stage) => <Button key={stage} type="button" variant="outline" className="min-h-11 gap-2 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text" aria-pressed={selectedStage === stage} onClick={() => setSelectedStage(stage)}>
          <span>{t(CRM_STAGE_LABEL_KEYS[stage])}</span><span className="text-xs text-muted-foreground">{pages[stage].totalCount}</span>
        </Button>)}
      </div>
      <div className="lg:hidden">{stageColumn(selectedStage, "mobile")}</div>
      <div className="hidden gap-4 overflow-x-auto pb-2 lg:grid lg:grid-cols-5" tabIndex={0} aria-label={t("pipeline.title")}>
        {CRM_LEAD_STAGES.map((stage) => stageColumn(stage, "desktop"))}
      </div>
      <p className="hidden text-xs text-muted-foreground lg:block">{t("pipeline.dragHint")}</p>
      <Button asChild variant="outline" className="min-h-11 self-start"><Link href="/crm/leads">{t("pipeline.manageLeads")}</Link></Button>
      <CrmLeadDrawer lead={drawerLead} open={drawerLead !== null} onOpenChange={(open) => !open && setDrawerLead(null)} onDeleted={removeFromPipeline} onLost={removeFromPipeline} onStageChanged={applyDrawerStageChange} setters={setters} offers={offers} closers={closers} canAssign={canAssign} canManagePipeline={canManagePipeline} />
    </div>
  );
}
