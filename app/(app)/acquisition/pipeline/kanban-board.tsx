"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useEffect, useState } from "react";

import type { Offer } from "@/lib/business/types";
import { LEAD_STAGES, LEAD_STAGE_LABELS, type LeadRow, type LeadStage } from "@/lib/leads/types";
import type { SetterRow } from "@/lib/setters/types";
import { cn } from "@/lib/utils";

import { LeadCard } from "./lead-card";
import { LeadDrawer } from "./lead-drawer";
import { changeStageAction } from "./lead-actions";
import { LostReasonDialog } from "./lost-reason-dialog";
import { SaleValidationDialog } from "./sale-validation-dialog";

function Column({
  stage,
  leads,
  offers,
  setters,
  commentCounts,
  onCardClick,
}: {
  stage: LeadStage;
  leads: LeadRow[];
  offers: Offer[];
  setters: SetterRow[];
  commentCounts: Record<string, number>;
  onCardClick: (lead: LeadRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const totalValue = leads.reduce((sum, lead) => sum + lead.potentialValueEur, 0);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 rounded-[var(--radius-card)] border border-border bg-surface-sunken p-2",
        isOver && "border-accent bg-accent-soft/40"
      )}
    >
      <div className="flex items-center justify-between px-1 py-1">
        <p className="text-sm font-bold">{LEAD_STAGE_LABELS[stage]}</p>
        <span className="text-xs font-bold text-muted-foreground">{leads.length}</span>
      </div>
      {totalValue > 0 && <p className="px-1 text-xs text-muted-foreground">{new Intl.NumberFormat("fr-FR").format(totalValue)} €</p>}

      <div className="flex flex-col gap-2">
        {leads.map((lead) => (
          <LeadCard
            key={lead.id}
            lead={lead}
            offerName={offers.find((o) => o.id === lead.offerId)?.name ?? null}
            setter={setters.find((s) => s.id === lead.setterId) ?? null}
            commentCount={commentCounts[lead.id] ?? 0}
            onClick={() => onCardClick(lead)}
          />
        ))}
      </div>
    </div>
  );
}

export function KanbanBoard({
  initialLeads,
  offers,
  setters,
  commentCounts,
}: {
  initialLeads: LeadRow[];
  offers: Offer[];
  setters: SetterRow[];
  commentCounts: Record<string, number>;
}) {
  const [leads, setLeads] = useState(initialLeads);
  const [activeLead, setActiveLead] = useState<LeadRow | null>(null);
  const [drawerLead, setDrawerLead] = useState<LeadRow | null>(null);
  const [lostDialogLeadId, setLostDialogLeadId] = useState<string | null>(null);
  const [saleDialogLead, setSaleDialogLead] = useState<LeadRow | null>(null);

  // Without a distance constraint, dnd-kit's default sensor treats any
  // pointer movement — even a click's inevitable sub-pixel jitter — as a
  // drag start, which swallows the browser's click event. 8px lets a real
  // drag still start immediately while a stationary click reaches
  // LeadCard's onClick and opens the drawer.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Server actions revalidatePath("/acquisition/pipeline") on every mutation,
  // which re-runs page.tsx and passes a fresh `initialLeads` prop down —
  // useState's initial value is only used on first mount, so this effect is
  // what actually picks up the refreshed data afterwards. Also re-syncs
  // `drawerLead` (stale otherwise: editing a field revalidates `leads` but
  // the drawer keeps rendering the ORIGINAL object it was opened with) —
  // and if the open lead was just deleted, the lookup returns undefined,
  // which closes the drawer automatically instead of showing a ghost lead.
  useEffect(() => {
    setLeads(initialLeads);
    setDrawerLead((prev) => (prev ? (initialLeads.find((lead) => lead.id === prev.id) ?? null) : prev));
  }, [initialLeads]);

  function handleDragStart(event: DragStartEvent) {
    const lead = leads.find((l) => l.id === event.active.id);
    setActiveLead(lead ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;

    const lead = leads.find((l) => l.id === active.id);
    const targetStage = over.id as LeadStage;
    if (!lead || lead.stage === targetStage) return;

    if (targetStage === "close") {
      setSaleDialogLead(lead);
      return;
    }
    if (targetStage === "perdu") {
      setLostDialogLeadId(lead.id);
      return;
    }

    // Optimistic update — reverted if the server call fails.
    const previousStage = lead.stage;
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage: targetStage } : l)));
    void changeStageAction(lead.id, { toStage: targetStage, lostReason: null }).then((result) => {
      if (result.error) {
        setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, stage: previousStage } : l)));
      }
    });
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {LEAD_STAGES.map((stage) => (
            <Column
              key={stage}
              stage={stage}
              leads={leads.filter((lead) => lead.stage === stage)}
              offers={offers}
              setters={setters}
              commentCounts={commentCounts}
              onCardClick={setDrawerLead}
            />
          ))}
        </div>

        <DragOverlay>
          {activeLead && (
            <LeadCard
              lead={activeLead}
              offerName={offers.find((o) => o.id === activeLead.offerId)?.name ?? null}
              setter={setters.find((s) => s.id === activeLead.setterId) ?? null}
              commentCount={commentCounts[activeLead.id] ?? 0}
              onClick={() => {}}
            />
          )}
        </DragOverlay>
      </DndContext>

      <LeadDrawer lead={drawerLead} offers={offers} setters={setters} open={drawerLead !== null} onOpenChange={(open) => !open && setDrawerLead(null)} />

      {lostDialogLeadId && (
        <LostReasonDialog
          leadId={lostDialogLeadId}
          open
          onOpenChange={(open) => {
            // Fires with `false` both on cancel and on a successful confirm
            // (LostReasonDialog closes itself either way) — the `leads`
            // useEffect above picks up the real result once
            // revalidatePath("/acquisition/pipeline") refreshes page.tsx's
            // data, so no manual state mutation is needed here.
            if (!open) setLostDialogLeadId(null);
          }}
        />
      )}

      {saleDialogLead && (
        <SaleValidationDialog
          lead={saleDialogLead}
          offers={offers}
          setters={setters}
          open
          onOpenChange={(open) => {
            if (!open) setSaleDialogLead(null);
          }}
        />
      )}
    </>
  );
}
