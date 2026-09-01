"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { CRM_LEAD_OUTCOMES, CRM_LEAD_SOURCES, CRM_LEAD_STAGES, type CrmLeadDetails, type CrmLeadOutcome, type CrmLeadSource, type CrmLeadStage } from "@/lib/crm/types";
import { CRM_EVENT_LABEL_KEYS, CRM_OUTCOME_LABEL_KEYS, CRM_STAGE_LABEL_KEYS } from "@/lib/crm/machine";
import type { ActiveCloser } from "@/lib/closers/types";
import type { Offer } from "@/lib/business/types";

import { addNoteAction, changeStageAction, reopenLeadAction, reassignLeadAction, setOutcomeAction, updateLeadFieldsAction } from "./crm-actions";
import { CrmActionForm } from "./crm-action-form";
import { CrmSaleValidationDialog } from "./crm-sale-validation-dialog";

export function CrmLeadDetail({ initialLead, setters, offers, closers, canAssign = true, inDrawer = false }: { initialLead: CrmLeadDetails; setters: Array<{ id: string; name: string; active: boolean }>; offers: Offer[]; closers: ActiveCloser[]; canAssign?: boolean; inDrawer?: boolean }) {
  const t = useTranslations("crm");
  const [lead, setLead] = useState(initialLead);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [reopenStage, setReopenStage] = useState<CrmLeadStage>(initialLead.stage);
  const [fields, setFields] = useState({
    displayName: initialLead.displayName,
    firstName: initialLead.firstName,
    lastName: initialLead.lastName,
    offerId: initialLead.offerId ?? "",
    source: (CRM_LEAD_SOURCES.includes(initialLead.source as CrmLeadSource) ? initialLead.source : "autre") as CrmLeadSource,
    potentialValueEur: String(initialLead.potentialValueEur),
    closer: initialLead.closer ?? "",
  });
  const [fieldsMessage, setFieldsMessage] = useState<string | null>(null);

  function mutate(action: () => Promise<{ error: string | null }>, update: (current: CrmLeadDetails) => CrmLeadDetails, afterSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) {
        setError(result.error);
        return;
      }
      setLead(update);
      afterSuccess?.();
    });
  }

  function addNote() {
    if (!note.trim()) return;
    const body = note.trim();
    mutate(() => addNoteAction({ leadId: lead.id, body }), (current) => ({ ...current, comments: [...current.comments, { id: `local-${Date.now()}`, userId: "current", body, createdAt: new Date().toISOString(), authorName: null }] }));
    setNote("");
  }

  function changeStage(stage: CrmLeadStage) {
    mutate(() => changeStageAction({ leadId: lead.id, stage }), (current) => ({ ...current, stage }), () => setReopenStage(stage));
  }

  function changeOutcome(outcome: CrmLeadOutcome) {
    if (outcome === "sold") {
      setSaleDialogOpen(true);
      return;
    }
    mutate(() => setOutcomeAction({ leadId: lead.id, outcome }), (current) => ({ ...current, outcome, isNoShow: outcome === "no_show" }));
  }

  function reassign(setterId: string) {
    const setter = setters.find((item) => item.id === setterId);
    mutate(() => reassignLeadAction({ leadId: lead.id, setterId: setterId || null }), (current) => ({ ...current, responsibleSetterId: setterId || null, responsibleSetterName: setter?.name ?? null }));
  }

  function reopen() {
    mutate(() => reopenLeadAction({ leadId: lead.id, stage: reopenStage, idempotencyKey: globalThis.crypto.randomUUID() }), (current) => ({ ...current, stage: reopenStage, outcome: "none", isNoShow: false }));
  }

  function saveFields() {
    setFieldsMessage(null);
    startTransition(async () => {
      const result = await updateLeadFieldsAction({
        leadId: lead.id,
        idempotencyKey: globalThis.crypto.randomUUID(),
        displayName: fields.displayName,
        firstName: fields.firstName,
        lastName: fields.lastName,
        offerId: fields.offerId || null,
        source: fields.source,
        potentialValueEur: Number(fields.potentialValueEur) || 0,
        closer: fields.closer || null,
      });
      if (result.error) {
        setFieldsMessage(result.error);
        return;
      }
      setLead((current) => ({ ...current, ...fields, offerId: fields.offerId || null, potentialValueEur: Number(fields.potentialValueEur) || 0, closer: fields.closer || null }));
      setFieldsMessage(t("detail.fieldsSaved"));
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}
      <section className="sticker-card flex flex-col gap-5 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            {!inDrawer && <Link href="/crm/leads" className="text-sm font-bold text-muted-foreground underline-offset-2 hover:underline">{t("detail.back")}</Link>}
            <h1 className={inDrawer ? "sr-only" : "mt-3 text-2xl font-bold"}>{lead.displayName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{lead.platform ? t(`sources.${lead.platform}`) : t("sources.autre")}{lead.normalizedHandle ? ` · @${lead.normalizedHandle}` : ""}</p>
          </div>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-sm font-bold text-accent-text">{t(CRM_OUTCOME_LABEL_KEYS[lead.outcome])}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-bold">{t("detail.changeStage")}
            <select value={lead.stage} disabled={isPending} onChange={(event) => changeStage(event.target.value as CrmLeadStage)} className="min-h-10 rounded border border-border bg-background px-2 outline-none focus-visible:border-accent">
              {CRM_LEAD_STAGES.map((stage) => <option key={stage} value={stage}>{t(CRM_STAGE_LABEL_KEYS[stage])}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("detail.responsible")}
            {canAssign ? <select value={lead.responsibleSetterId ?? ""} disabled={isPending} onChange={(event) => reassign(event.target.value)} className="min-h-10 rounded border border-border bg-background px-2 outline-none focus-visible:border-accent">
              <option value="">{t("detail.reassign")}</option>
              {setters.filter((setter) => setter.active).map((setter) => <option key={setter.id} value={setter.id}>{setter.name}</option>)}
            </select> : <span className="min-h-10 rounded border border-border bg-muted/20 px-2 py-2 text-sm font-normal">{lead.responsibleSetterName ?? t("detail.unassigned")}</span>}
          </label>
          <div className="flex flex-col gap-1 text-sm font-bold"><span>{t("detail.changeOutcome")}</span><div className="flex flex-wrap gap-2">
            {CRM_LEAD_OUTCOMES.filter((outcome) => outcome !== "none").map((outcome) => <Button key={outcome} type="button" variant="outline" size="sm" disabled={isPending} onClick={() => changeOutcome(outcome)}>{t(CRM_OUTCOME_LABEL_KEYS[outcome])}</Button>)}
            {(lead.outcome === "lost" || lead.outcome === "no_show") && <div className="flex basis-full flex-wrap items-end gap-2">
              <label className="flex min-w-48 flex-1 flex-col gap-1">{t("detail.reopenStage")}
                <select value={reopenStage} disabled={isPending} onChange={(event) => setReopenStage(event.target.value as CrmLeadStage)} className="min-h-10 rounded border border-border bg-background px-2 text-sm outline-none focus-visible:border-accent">
                  {CRM_LEAD_STAGES.map((stage) => <option key={stage} value={stage}>{t(CRM_STAGE_LABEL_KEYS[stage])}</option>)}
                </select>
              </label>
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={reopen}>{t("detail.reopen")}</Button>
            </div>}
          </div></div>
        </div>
      </section>

      <section className="sticker-card p-5 sm:p-7" aria-labelledby="crm-qualification-title">
        <h2 id="crm-qualification-title" className="text-lg font-bold">{t("detail.qualification")}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-bold sm:col-span-2">{t("detail.displayName")}<input value={fields.displayName} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, displayName: event.target.value }))} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("detail.firstName")}<input value={fields.firstName} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, firstName: event.target.value }))} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("detail.lastName")}<input value={fields.lastName} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, lastName: event.target.value }))} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("detail.offer")}<select value={fields.offerId} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, offerId: event.target.value }))} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("detail.noOffer")}</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("detail.source")}<select value={fields.source} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, source: event.target.value as CrmLeadSource }))} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent">{CRM_LEAD_SOURCES.map((source) => <option key={source} value={source}>{t(`leads.sourceOptions.${source}`)}</option>)}</select></label>
          <label className="flex flex-col gap-1 text-sm font-bold">{t("detail.potentialValue")}<input type="number" min={0} value={fields.potentialValueEur} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, potentialValueEur: event.target.value }))} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent" /></label>
          <label className="flex flex-col gap-1 text-sm font-bold sm:col-span-2">{t("detail.closer")}<select value={fields.closer} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, closer: event.target.value }))} className="min-h-10 rounded border border-border bg-background px-2 font-normal outline-none focus-visible:border-accent"><option value="">{t("detail.unassigned")}</option>{closers.map((closer) => <option key={closer.id} value={closer.name}>{closer.name}</option>)}</select></label>
        </div>
        {fieldsMessage && <p className="mt-3 text-sm text-muted-foreground" role="status">{fieldsMessage}</p>}
        <Button type="button" variant="outline" className="mt-3" disabled={isPending} onClick={saveFields}>{t("detail.saveFields")}</Button>
      </section>

      <section className="sticker-card p-5 sm:p-7" aria-labelledby="crm-history-title">
        <h2 id="crm-history-title" className="text-lg font-bold">{t("detail.history")}</h2>
        {lead.stageHistory.length === 0 && lead.events.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t("detail.noHistory")}</p> : <ul className="mt-3 flex flex-col gap-2 text-sm">
          {lead.stageHistory.map((item) => <li key={item.id} className="border-l-2 border-accent pl-3"><span className="font-bold">{t(CRM_STAGE_LABEL_KEYS[item.toStage])}</span><span className="ml-2 text-muted-foreground">{new Date(item.changedAt).toLocaleString()}</span>{item.actorName && <span className="ml-2 text-muted-foreground">· {item.actorName}</span>}</li>)}
          {lead.events.filter((event) => !["first_message_sent", "conversation_started"].includes(event.type)).map((event) => <li key={event.id} className="border-l-2 border-border pl-3"><span className="font-bold">{t(CRM_EVENT_LABEL_KEYS[event.type])}</span><span className="ml-2 text-muted-foreground">{new Date(event.occurredAt ?? event.createdAt).toLocaleString()}</span>{event.actorName && <span className="ml-2 text-muted-foreground">· {event.actorName}</span>}</li>)}
        </ul>}
      </section>

      <section className="sticker-card p-5 sm:p-7" aria-labelledby="crm-notes-title">
        <h2 id="crm-notes-title" className="text-lg font-bold">{t("detail.notes")}</h2>
        <div className="mt-3 flex flex-col gap-3">
          {lead.comments.length === 0 ? <p className="text-sm text-muted-foreground">{t("detail.noNotes")}</p> : lead.comments.map((comment) => <div key={comment.id} className="rounded border border-border bg-muted/20 p-3 text-sm"><p>{comment.body}</p><p className="mt-1 text-xs text-muted-foreground">{comment.authorName ?? t("detail.unknownAuthor")} · {new Date(comment.createdAt).toLocaleString()}</p></div>)}
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder={t("detail.notePlaceholder")} rows={3} className="rounded border border-border bg-background p-3 text-sm outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20" />
          <Button type="button" className="self-start" disabled={isPending || !note.trim()} onClick={addNote}>{t("detail.saveNote")}</Button>
        </div>
      </section>

      <section className="sticker-card p-5 sm:p-7" aria-labelledby="crm-actions-title">
        <h2 id="crm-actions-title" className="text-lg font-bold">{t("tabs.actions")}</h2>
        <div className="mt-3 flex flex-col gap-2">{lead.actions.map((action) => <p key={action.id} className="text-sm"><span className="font-bold">{action.title}</span><span className="ml-2 text-muted-foreground">{new Date(action.dueAt).toLocaleString()}</span></p>)}</div>
        <div className="mt-4"><CrmActionForm leadId={lead.id} /></div>
      </section>

      <section className="sticker-card p-5 sm:p-7" aria-labelledby="crm-calls-title">
        <h2 id="crm-calls-title" className="text-lg font-bold">{t("tabs.calls")}</h2>
        {lead.calls.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{t("detail.noCalls")}</p> : <ul className="mt-3 flex flex-col gap-2 text-sm">{lead.calls.map((call) => <li key={call.id}><span className="font-bold">{call.inviteeName ?? ""}</span><span className="ml-2 text-muted-foreground">{new Date(call.scheduledAt).toLocaleString()}</span></li>)}</ul>}
      </section>
      <CrmSaleValidationDialog lead={lead} offers={offers} setters={setters} closers={closers} open={saleDialogOpen} onOpenChange={setSaleDialogOpen} onValidated={() => setLead((current) => ({ ...current, outcome: "sold", isNoShow: false }))} />
    </div>
  );
}
