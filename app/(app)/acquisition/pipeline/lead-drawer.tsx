"use client";

import { useEffect, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import type { Offer } from "@/lib/business/types";
import type { ActiveCloser } from "@/lib/closers/types";
import { formatEur } from "@/lib/currency";
import {
  LEAD_SOURCES,
  type LeadRow,
  type LeadWithRelations,
} from "@/lib/leads/types";
import type { SetterRow } from "@/lib/setters/types";

import { addCommentAction, deleteLeadAction, getLeadDetailAction, setReminderAction, toggleReminderDoneAction, updateLeadAction } from "./lead-actions";
import { LostReasonDialog } from "./lost-reason-dialog";
import { SaleValidationDialog } from "./sale-validation-dialog";

function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function LeadDrawer({
  lead,
  offers,
  setters,
  closers,
  open,
  onOpenChange,
}: {
  lead: LeadRow | null;
  offers: Offer[];
  setters: SetterRow[];
  closers: ActiveCloser[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const locale = useLocale();
  const t = useTranslations("pipeline");
  const [detail, setDetail] = useState<LeadWithRelations | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderNote, setReminderNote] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [lostDialogOpen, setLostDialogOpen] = useState(false);
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
    if (!window.confirm(t("leadDrawer.deleteConfirm", { name: `${lead!.firstName} ${lead!.lastName}` }))) return;
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
    <>
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
                {t(`source.${lead.source}`)}
                {offer && ` · ${offer.name}`} · {formatEur(lead.potentialValueEur, locale)}
              </p>
              <p className="mt-1 text-xs font-bold text-muted-foreground uppercase">
                {t(`stage.${lead.stage}`)}
                {lead.stage === "perdu" && lead.lostReason && ` — ${t(`lostReason.${lead.lostReason}`)}`}
              </p>
            </div>
            <DrawerClose className="flex size-7 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-muted-foreground hover:bg-muted">
              ✕
            </DrawerClose>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-3">
                <p className="text-sm font-bold">{t("leadDrawer.information")}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">{t("leadDrawer.firstName")}</span>
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
                    <span className="text-muted-foreground">{t("leadDrawer.lastName")}</span>
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
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">{t("leadDrawer.source")}</span>
                    <select
                      defaultValue={lead.source}
                      onChange={(event) => handleFieldUpdate({ source: event.target.value as LeadRow["source"] })}
                      className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                    >
                      {LEAD_SOURCES.map((source) => (
                        <option key={source} value={source}>
                          {t(`source.${source}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm">
                    <span className="text-muted-foreground">{t("leadDrawer.offer")}</span>
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
                  <span className="text-muted-foreground">{t("leadDrawer.potentialValue")}</span>
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

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span className="text-muted-foreground">{t("setter")}</span>
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
                  <span className="text-muted-foreground">{t("closer")}</span>
                  <select
                    defaultValue={lead.closer ?? ""}
                    onChange={(event) => handleFieldUpdate({ closer: event.target.value || null })}
                    className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  >
                    <option value="">—</option>
                    {lead.closer && !closers.some((closer) => closer.name === lead.closer) && (
                      <option value={lead.closer}>{lead.closer}</option>
                    )}
                    {closers.map((closer) => (
                      <option key={closer.id} value={closer.name}>
                        {closer.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
                <p className="text-sm font-bold">{t("leadDrawer.followUpReminder")}</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="date"
                    value={reminderDate}
                    onChange={(event) => setReminderDate(event.target.value)}
                    onBlur={handleSaveReminder}
                    className="rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  />
                  <input
                    type="text"
                    placeholder={t("leadDrawer.note")}
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
                    <span>{t("leadDrawer.done")}</span>
                  </label>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold">{t("leadDrawer.comments")}</p>
                {detail?.comments.length ? (
                  <div className="flex flex-col gap-2">
                    {detail.comments.map((comment) => (
                      <div key={comment.id} className="rounded-xl bg-muted p-2.5 text-sm">
                        <p>{comment.body}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(comment.createdAt, locale)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("leadDrawer.noComments")}</p>
                )}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={commentBody}
                    onChange={(event) => setCommentBody(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") handleAddComment();
                    }}
                    placeholder={t("leadDrawer.addCommentPlaceholder")}
                    className="flex-1 rounded-[var(--radius-control)] border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/12"
                  />
                  <Button type="button" size="sm" disabled={isPending} onClick={handleAddComment}>
                    {t("leadDrawer.add")}
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-bold">{t("leadDrawer.history")}</p>
                {detail?.history.length ? (
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {[...detail.history].reverse().map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between text-xs">
                        <span>
                          {entry.fromStage ? `${t(`stage.${entry.fromStage}`)} → ` : ""}
                          {t(`stage.${entry.toStage}`)}
                        </span>
                        <span className="text-muted-foreground">{formatDateTime(entry.changedAt, locale)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("leadDrawer.loading")}</p>
                )}
              </div>

              <div className="border-t border-border pt-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button type="button" size="sm" onClick={() => setSaleDialogOpen(true)}>
                    {t("leadDrawer.validateSale")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setLostDialogOpen(true)}>
                    {t("leadDrawer.lost")}
                  </Button>
                  <Button type="button" variant="destructive" size="sm" disabled={isDeleting} onClick={handleDelete}>
                    {isDeleting ? t("leadDrawer.deleting") : t("leadDrawer.delete")}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DrawerContent>
      </Drawer>
      <LostReasonDialog leadId={lead.id} open={lostDialogOpen} onOpenChange={setLostDialogOpen} />
      <SaleValidationDialog lead={lead} offers={offers} setters={setters} closers={closers} open={saleDialogOpen} onOpenChange={setSaleDialogOpen} />
    </>
  );
}
