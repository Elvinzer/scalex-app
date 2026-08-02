"use client";

import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { Offer } from "@/lib/business/types";
import { formatEur } from "@/lib/currency";
import {
  LEAD_LOST_REASON_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_SOURCES,
  LEAD_STAGE_LABELS,
  type LeadRow,
  type LeadWithRelations,
} from "@/lib/leads/types";
import type { SetterRow } from "@/lib/setters/types";

import { addCommentAction, deleteLeadAction, getLeadDetailAction, setReminderAction, toggleReminderDoneAction, updateLeadAction } from "./lead-actions";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function LeadDrawer({
  lead,
  offers,
  setters,
  open,
  onOpenChange,
}: {
  lead: LeadRow | null;
  offers: Offer[];
  setters: SetterRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [detail, setDetail] = useState<LeadWithRelations | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, startDeleteTransition] = useTransition();

  useEffect(() => {
    if (!open || !lead) {
      setDetail(null);
      return;
    }
    setReminderDate(lead.reminderDate ?? "");
    setReminderNote(lead.reminderNote ?? "");
    setFieldError(null);
    void getLeadDetailAction(lead.id).then(setDetail);
  }, [open, lead]);

  if (!lead) return null;

  const offer = offers.find((o) => o.id === lead.offerId);

  function handleFieldUpdate(patch: {
    firstName?: string;
    lastName?: string;
    source?: LeadRow["source"];
    offerId?: string | null;
    potentialValueEur?: number;
    setterId?: string | null;
    closer?: string | null;
  }) {
    startTransition(async () => {
      const result = await updateLeadAction(lead!.id, patch);
      setFieldError(result.error);
    });
  }

  function handleDelete() {
    if (!window.confirm(`Supprimer définitivement ${lead!.firstName} ${lead!.lastName} ? Cette action est irréversible.`)) return;
    startDeleteTransition(async () => {
      const result = await deleteLeadAction(lead!.id);
      if (result.error) {
        setFieldError(result.error);
        return;
      }
      onOpenChange(false);
    });
  }

  function handleAddComment() {
    if (!commentBody.trim()) return;
    startTransition(async () => {
      await addCommentAction(lead!.id, { body: commentBody.trim() });
      setCommentBody("");
      const next = await getLeadDetailAction(lead!.id);
      setDetail(next);
    });
  }

  function handleSaveReminder() {
    startTransition(async () => {
      await setReminderAction(lead!.id, { reminderDate: reminderDate || null, reminderNote: reminderNote || null });
    });
  }

  function handleToggleReminderDone(done: boolean) {
    startTransition(async () => {
      await toggleReminderDoneAction(lead!.id, done);
    });
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        {/* Keyed by lead id — forces a remount of every uncontrolled
            defaultValue field below when the user clicks a different card
            without closing the drawer first (open stays true, only `lead`
            changes), so a stale value from the previous lead never lingers. */}
        <div key={lead.id} className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-border p-4">
            <div>
              <DrawerTitle className="text-base font-bold">
                {lead.firstName} {lead.lastName}
              </DrawerTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                {LEAD_SOURCE_LABELS[lead.source]}
                {offer && ` · ${offer.name}`} · {formatEur(lead.potentialValueEur)}
              </p>
              <p className="mt-1 text-xs font-bold text-muted-foreground uppercase">
                {LEAD_STAGE_LABELS[lead.stage]}
                {lead.stage === "perdu" && lead.lostReason && ` — ${LEAD_LOST_REASON_LABELS[lead.lostReason]}`}
              </p>
            </div>
            <DrawerClose className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted">
              ✕
            </DrawerClose>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <p className="text-sm font-bold">Informations</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Prénom</span>
                    <input
                      type="text"
                      defaultValue={lead.firstName}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value) handleFieldUpdate({ firstName: value });
                      }}
                      className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Nom</span>
                    <input
                      type="text"
                      defaultValue={lead.lastName}
                      onBlur={(event) => {
                        const value = event.target.value.trim();
                        if (value) handleFieldUpdate({ lastName: value });
                      }}
                      className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Source</span>
                    <select
                      defaultValue={lead.source}
                      onChange={(event) => handleFieldUpdate({ source: event.target.value as LeadRow["source"] })}
                      className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                    >
                      {LEAD_SOURCES.map((source) => (
                        <option key={source} value={source}>
                          {LEAD_SOURCE_LABELS[source]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">Offre visée</span>
                    <select
                      defaultValue={lead.offerId ?? ""}
                      onChange={(event) => handleFieldUpdate({ offerId: event.target.value || null })}
                      className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                    >
                      <option value="">—</option>
                      {offers.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Valeur potentielle (€)</span>
                  <input
                    type="number"
                    min={0}
                    defaultValue={lead.potentialValueEur}
                    onBlur={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isFinite(value) && value >= 0) handleFieldUpdate({ potentialValueEur: value });
                    }}
                    className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none tabular-nums focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  />
                </label>
                {fieldError && <p className="text-sm text-state-critical">{fieldError}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Setter</span>
                  <select
                    defaultValue={lead.setterId ?? ""}
                    onChange={(event) => handleFieldUpdate({ setterId: event.target.value || null })}
                    className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  >
                    <option value="">—</option>
                    {setters.map((setter) => (
                      <option key={setter.id} value={setter.id}>
                        {setter.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">Closer</span>
                  <input
                    type="text"
                    defaultValue={lead.closer ?? ""}
                    onBlur={(event) => handleFieldUpdate({ closer: event.target.value || null })}
                    className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  />
                </label>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <p className="text-sm font-bold">Rappel de follow-up</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={reminderDate}
                    onChange={(event) => setReminderDate(event.target.value)}
                    onBlur={handleSaveReminder}
                    className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  />
                  <input
                    type="text"
                    placeholder="Note"
                    value={reminderNote}
                    onChange={(event) => setReminderNote(event.target.value)}
                    onBlur={handleSaveReminder}
                    className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  />
                </div>
                {lead.reminderDate && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={lead.reminderDone}
                      onChange={(event) => handleToggleReminderDone(event.target.checked)}
                      className="size-4"
                    />
                    <span>Fait</span>
                  </label>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold">Commentaires</p>
                {detail?.comments.length ? (
                  <div className="flex flex-col gap-2">
                    {detail.comments.map((comment) => (
                      <div key={comment.id} className="rounded-xl bg-muted p-2.5 text-sm">
                        <p>{comment.body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(comment.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Aucun commentaire pour l&apos;instant.</p>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleAddComment();
                    }}
                    placeholder="Ajouter un commentaire..."
                    className="flex-1 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  />
                  <Button type="button" size="sm" disabled={isPending} onClick={handleAddComment}>
                    Ajouter
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold">Historique</p>
                {detail?.history.length ? (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {[...detail.history].reverse().map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between text-xs">
                        <span>
                          {entry.fromStage ? `${LEAD_STAGE_LABELS[entry.fromStage]} → ` : ""}
                          {LEAD_STAGE_LABELS[entry.toStage]}
                        </span>
                        <span className="text-muted-foreground">{formatDateTime(entry.changedAt)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Chargement...</p>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <Button type="button" variant="destructive" size="sm" disabled={isDeleting} onClick={handleDelete}>
                  {isDeleting ? "Suppression..." : "Supprimer ce lead"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
