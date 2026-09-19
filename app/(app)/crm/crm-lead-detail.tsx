"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, CalendarClock, FileText, History, NotebookPen, PhoneCall, SlidersHorizontal, Trash2, UserRound, type LucideIcon } from "lucide-react";

import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { Button } from "@/components/ui/button";
import { CRM_LEAD_OUTCOMES, CRM_LEAD_SOURCES, CRM_LEAD_STAGES, type CrmLeadDetails, type CrmLeadOutcome, type CrmLeadSource, type CrmLeadStage, type CrmLostReason } from "@/lib/crm/types";
import { CRM_EVENT_LABEL_KEYS, CRM_OUTCOME_LABEL_KEYS, CRM_STAGE_LABEL_KEYS } from "@/lib/crm/machine";
import type { ActiveCloser } from "@/lib/closers/types";
import type { Offer } from "@/lib/business/types";

import { addNoteAction, changeStageAction, deleteLeadAction, markContactedAction, markResponseAction, reopenLeadAction, reassignLeadAction, saveQualificationAction, setOutcomeAction, updateLeadFieldsAction } from "./crm-actions";
import { CrmActionForm } from "./crm-action-form";
import { CrmBookingActions } from "./crm-booking-actions";
import { CrmLossDialog } from "./crm-loss-dialog";
import { CrmSaleValidationDialog } from "./crm-sale-validation-dialog";
import { CrmProfileLink } from "./crm-profile-link";

const inputClassName = "min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";
const textareaClassName = "w-full rounded-[var(--radius-control)] border border-border bg-background p-3 text-sm leading-6 outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

function DetailSectionHeader({ headingId, icon: Icon, title, description, trailing }: { headingId: string; icon: LucideIcon; title: string; description?: string; trailing?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-accent-soft text-accent-text" aria-hidden="true">
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <div className="min-w-0">
          <h2 id={headingId} className="text-lg font-bold tracking-[-0.01em]">{title}</h2>
          {description && <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>}
        </div>
      </div>
      {trailing}
    </div>
  );
}

export function CrmLeadDetail({ initialLead, setters, offers, closers, canAssign = true, canManagePipeline = false, inDrawer = false, onDeleted }: { initialLead: CrmLeadDetails; setters: Array<{ id: string; name: string; active: boolean }>; offers: Offer[]; closers: ActiveCloser[]; canAssign?: boolean; canManagePipeline?: boolean; inDrawer?: boolean; onDeleted?: () => void }) {
  const t = useTranslations("crm");
  const callsT = useTranslations("crm.calls");
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [note, setNote] = useState("");
  const [qualification, setQualification] = useState(initialLead.qualificationNote ?? "");
  const [qualificationDirty, setQualificationDirty] = useState(false);
  const [qualificationMessage, setQualificationMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saleDialogOpen, setSaleDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [reopenStage, setReopenStage] = useState<CrmLeadStage>(initialLead.stage);
  const [fields, setFields] = useState({
    displayName: initialLead.displayName,
    firstName: initialLead.firstName,
    lastName: initialLead.lastName,
    offerId: initialLead.offerId ?? "",
    source: (CRM_LEAD_SOURCES.includes(initialLead.source as CrmLeadSource) ? initialLead.source : "autre") as CrmLeadSource,
    potentialValueEur: String(initialLead.potentialValueEur),
    closer: initialLead.closer ?? "",
    closerUserId: initialLead.closerUserId ?? "",
    email: initialLead.email ?? "",
    phone: initialLead.phone ?? "",
  });
  const [fieldsMessage, setFieldsMessage] = useState<string | null>(null);
  const [noteIdempotencyKey, setNoteIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [qualificationIdempotencyKey, setQualificationIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [fieldsIdempotencyKey, setFieldsIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [stageIdempotencyKey, setStageIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [contactIdempotencyKey, setContactIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [responseIdempotencyKey, setResponseIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [outcomeIdempotencyKey, setOutcomeIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [reopenIdempotencyKey, setReopenIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [responsibilityIdempotencyKey, setResponsibilityIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());

  useEffect(() => {
    const raw = sessionStorage.getItem(`minaly.crm.lead-draft:${lead.id}`);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw) as { note?: string; qualification?: string; noteIdempotencyKey?: string; qualificationIdempotencyKey?: string };
      if (typeof draft.note === "string") setNote(draft.note);
      if (typeof draft.qualification === "string") {
        setQualification(draft.qualification);
        setQualificationDirty(true);
      }
      if (typeof draft.noteIdempotencyKey === "string") setNoteIdempotencyKey(draft.noteIdempotencyKey);
      if (typeof draft.qualificationIdempotencyKey === "string") setQualificationIdempotencyKey(draft.qualificationIdempotencyKey);
    } catch {
      sessionStorage.removeItem(`minaly.crm.lead-draft:${lead.id}`);
    }
  }, [lead.id]);

  useEffect(() => {
    if (!note.trim() && !qualificationDirty) {
      sessionStorage.removeItem(`minaly.crm.lead-draft:${lead.id}`);
      return;
    }
    sessionStorage.setItem(`minaly.crm.lead-draft:${lead.id}`, JSON.stringify({ note, noteIdempotencyKey, ...(qualificationDirty ? { qualification, qualificationIdempotencyKey } : {}) }));
  }, [lead.id, note, noteIdempotencyKey, qualification, qualificationDirty, qualificationIdempotencyKey]);

  function mutate<T extends { error: string | null }>(action: () => Promise<T>, update: (current: CrmLeadDetails, result: T) => CrmLeadDetails, afterSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result.error) {
          setError(result.error);
          return;
        }
        setLead((current) => update(current, result));
        afterSuccess?.();
      } catch {
        setError(t("errors.requestFailed"));
      }
    });
  }

  function addNote() {
    if (!note.trim()) return;
    const body = note.trim();
    mutate(() => addNoteAction({ leadId: lead.id, body, idempotencyKey: noteIdempotencyKey }), (current, result) => {
      const savedNote = "note" in result && result.note ? result.note : { id: `local-${Date.now()}`, userId: "current", body, createdAt: new Date().toISOString() };
      if (current.comments.some((comment) => comment.id === savedNote.id)) return current;
      return { ...current, comments: [...current.comments, { ...savedNote, authorName: null }] };
    }, () => { setNote(""); setNoteIdempotencyKey(globalThis.crypto.randomUUID()); });
  }

  function changeStage(stage: CrmLeadStage) {
    mutate(() => changeStageAction({ leadId: lead.id, stage, idempotencyKey: stageIdempotencyKey }), (current) => ({ ...current, stage }), () => { setReopenStage(stage); setStageIdempotencyKey(globalThis.crypto.randomUUID()); });
  }

  function changeOutcome(outcome: CrmLeadOutcome) {
    if (outcome === "sold") {
      setSaleDialogOpen(true);
      return;
    }
    if (outcome === "lost") {
      setLossDialogOpen(true);
      return;
    }
    mutate(() => setOutcomeAction({ leadId: lead.id, outcome, idempotencyKey: outcomeIdempotencyKey }), (current) => ({ ...current, outcome, isNoShow: outcome === "no_show" }), () => setOutcomeIdempotencyKey(globalThis.crypto.randomUUID()));
  }

  function reassign(setterId: string) {
    const setter = setters.find((item) => item.id === setterId);
    mutate(() => reassignLeadAction({ leadId: lead.id, setterId: setterId || null, idempotencyKey: responsibilityIdempotencyKey }), (current) => ({ ...current, responsibleSetterId: setterId || null, responsibleSetterName: setter?.name ?? null }), () => setResponsibilityIdempotencyKey(globalThis.crypto.randomUUID()));
  }

  function reopen() {
    mutate(() => reopenLeadAction({ leadId: lead.id, stage: reopenStage, idempotencyKey: reopenIdempotencyKey }), (current) => ({ ...current, stage: reopenStage, outcome: "none", isNoShow: false }), () => setReopenIdempotencyKey(globalThis.crypto.randomUUID()));
  }

  function saveFields() {
    setFieldsMessage(null);
    startTransition(async () => {
      try {
        const result = await updateLeadFieldsAction({
          leadId: lead.id,
          idempotencyKey: fieldsIdempotencyKey,
          displayName: fields.displayName,
          firstName: fields.firstName,
          lastName: fields.lastName,
          offerId: fields.offerId || null,
          source: fields.source,
          potentialValueEur: Number(fields.potentialValueEur) || 0,
          closer: fields.closer || null,
          closerUserId: fields.closerUserId || null,
          email: fields.email || null,
          phone: fields.phone || null,
        });
        if (result.error) {
          setFieldsMessage(result.error);
          return;
        }
        setLead((current) => ({ ...current, ...fields, offerId: fields.offerId || null, potentialValueEur: Number(fields.potentialValueEur) || 0, closer: fields.closer || null, closerUserId: fields.closerUserId || null, email: fields.email || null, phone: fields.phone || null }));
        setFieldsMessage(t("detail.fieldsSaved"));
        setFieldsIdempotencyKey(globalThis.crypto.randomUUID());
      } catch {
        setFieldsMessage(t("errors.requestFailed"));
      }
    });
  }

  function markContacted() {
    mutate(() => markContactedAction({ leadId: lead.id, idempotencyKey: contactIdempotencyKey }), (current) => ({ ...current, contactState: "contacted", messageOccurredAt: current.messageOccurredAt ?? new Date().toISOString() }), () => setContactIdempotencyKey(globalThis.crypto.randomUUID()));
  }

  function markResponded() {
    mutate(() => markResponseAction({ leadId: lead.id, idempotencyKey: responseIdempotencyKey }), (current) => ({ ...current, respondedAt: current.respondedAt ?? new Date().toISOString() }), () => setResponseIdempotencyKey(globalThis.crypto.randomUUID()));
  }

  function saveQualification() {
    setQualificationMessage(null);
    startTransition(async () => {
      try {
        const result = await saveQualificationAction({ leadId: lead.id, body: qualification, idempotencyKey: qualificationIdempotencyKey });
        if (result.error) {
          setQualificationMessage(result.error);
          return;
        }
        setLead((current) => ({ ...current, qualificationNote: qualification.trim() || null }));
        setQualificationMessage(t("detail.qualificationSaved"));
        setQualificationDirty(false);
        setQualificationIdempotencyKey(globalThis.crypto.randomUUID());
        if (note.trim()) {
          sessionStorage.setItem(`minaly.crm.lead-draft:${lead.id}`, JSON.stringify({ note, noteIdempotencyKey }));
        } else {
          sessionStorage.removeItem(`minaly.crm.lead-draft:${lead.id}`);
        }
      } catch {
        setQualificationMessage(t("errors.requestFailed"));
      }
    });
  }

  function handleLost(reason: CrmLostReason) {
    setLead((current) => ({ ...current, outcome: "lost", isNoShow: false, lostReason: reason }));
  }

  function handleBooked(booking: { scheduledAt: string; timeZone: string; closerName: string }) {
    setLead((current) => ({
      ...current,
      stage: "call_booked",
      contactState: "contacted",
      nextCall: { id: `local-${booking.scheduledAt}`, scheduledAt: booking.scheduledAt, timeZone: booking.timeZone, closer: booking.closerName, source: "minaly_internal", attendance: "booked", outcome: "pending" },
    }));
  }

  function callOutcomeLabel(outcome: NonNullable<CrmLeadDetails["nextCall"]>["outcome"]): string {
    if (outcome === "closed") return callsT("closed");
    if (outcome === "not_closed") return callsT("notClosed");
    if (outcome === "awaiting_decision") return callsT("awaitingDecision");
    return callsT("pending");
  }

  function deleteLead() {
    setDeleteError(null);
    startTransition(async () => {
      const result = await deleteLeadAction({ leadId: lead.id });
      if (result.error) {
        setDeleteError(result.error);
        return;
      }
      setDeleteDialogOpen(false);
      if (onDeleted) {
        router.refresh();
        onDeleted();
      } else {
        router.replace("/crm/leads");
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      {error && <p className="text-sm font-bold text-state-critical" role="alert">{error}</p>}
      <section className="sticker-card flex flex-col gap-5 overflow-hidden p-4 sm:p-6 lg:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {!inDrawer && <Link href="/crm/leads" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"><ArrowLeft className="size-4" aria-hidden="true" />{t("detail.back")}</Link>}
            <div className={inDrawer ? "" : "mt-4"}>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className={inDrawer ? "sr-only" : "text-2xl font-bold tracking-[-0.02em] sm:text-3xl"}>{lead.displayName}</h1>
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-text">{t(CRM_OUTCOME_LABEL_KEYS[lead.outcome])}</span>
                <span className="rounded-full border border-border bg-muted/20 px-2.5 py-1 text-xs font-bold">{t(CRM_STAGE_LABEL_KEYS[lead.stage])}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{lead.platform ? t(`sources.${lead.platform}`) : t("sources.autre")}{lead.normalizedHandle ? ` · @${lead.normalizedHandle}` : ""}</p>
            <div className="mt-4 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5 text-sm">
              <span className="inline-flex shrink-0 items-center gap-1.5 font-bold text-muted-foreground"><UserRound className="size-3.5" aria-hidden="true" />{t("detail.profileUrl")}</span>
              {lead.canonicalProfileUrl ? <><span className="min-w-0 max-w-full break-all text-muted-foreground">{lead.canonicalProfileUrl}</span><CrmProfileLink href={lead.canonicalProfileUrl} label={t("detail.openProfile")} /></> : <span className="text-muted-foreground">{t("detail.profileUrlMissing")}</span>}
            </div>
            </div>
          </div>
          {canManagePipeline && <Button type="button" variant="destructive" size="sm" className="min-h-11" disabled={isPending} onClick={() => { setDeleteError(null); setDeleteDialogOpen(true); }}><Trash2 className="size-4" aria-hidden="true" />{t("detail.delete")}</Button>}
        </div>

        <div className="grid gap-px overflow-hidden rounded-[var(--radius-control)] border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0 bg-card p-3.5"><p className="text-xs font-bold text-muted-foreground">{t("detail.contactState")}</p><p className="mt-1 break-words font-bold">{lead.contactState === "new" ? t("detail.newLead") : t("detail.contacted")}</p></div>
          <div className="min-w-0 bg-card p-3.5"><p className="text-xs font-bold text-muted-foreground">{t("detail.responseState")}</p><p className="mt-1 break-words font-bold">{lead.respondedAt ? t("detail.responded") : t("detail.noResponse")}</p></div>
          <div className="min-w-0 bg-card p-3.5"><p className="text-xs font-bold text-muted-foreground">{t("detail.nextCall")}</p>{lead.nextCall ? <><p className="mt-1 break-words font-bold">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short", timeZone: lead.nextCall.timeZone ?? undefined }).format(new Date(lead.nextCall.scheduledAt))}</p><p className="mt-1 break-words text-xs text-muted-foreground">{lead.nextCall.timeZone ?? t("detail.localTime")} · {lead.nextCall.closer ?? t("detail.unassigned")} · {callOutcomeLabel(lead.nextCall.outcome)}</p></> : <p className="mt-1 break-words font-bold">{t("detail.noNextCall")}</p>}</div>
          <div className="min-w-0 bg-card p-3.5"><p className="text-xs font-bold text-muted-foreground">{t("detail.nextAction")}</p><p className="mt-1 break-words font-bold">{lead.nextAction?.title ?? t("leads.noNextAction")}</p></div>
        </div>

        {(lead.contactState === "new" || !lead.respondedAt) && <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5" aria-label={t("detail.quickActions")}>
          <span className="text-sm font-bold text-muted-foreground">{t("detail.quickActions")}</span>
          {lead.contactState === "new" && <Button type="button" variant="outline" className="min-h-11" disabled={isPending} onClick={markContacted}>{t("detail.messageSent")}</Button>}
          {!lead.respondedAt && <Button type="button" variant="outline" className="min-h-11" disabled={isPending} onClick={markResponded}>{t("detail.markResponded")}</Button>}
        </div>}

        <CrmBookingActions lead={lead} onBooked={handleBooked} />

        <div className="rounded-[var(--radius-control)] border border-border bg-muted/20 p-4">
          <div className="mb-4 flex size-8 items-center justify-center rounded-[var(--radius-control)] bg-card text-muted-foreground" aria-hidden="true"><SlidersHorizontal className="size-4" /></div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.35fr)]">
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold">{t("detail.changeStage")}
            <select value={lead.stage} disabled={isPending} onChange={(event) => changeStage(event.target.value as CrmLeadStage)} className={inputClassName}>
              {CRM_LEAD_STAGES.map((stage) => <option key={stage} value={stage}>{t(CRM_STAGE_LABEL_KEYS[stage])}</option>)}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold">{t("detail.responsible")}
            {canAssign ? <select value={lead.responsibleSetterId ?? ""} disabled={isPending} onChange={(event) => reassign(event.target.value)} className={inputClassName}>
              <option value="">{t("detail.reassign")}</option>
              {setters.filter((setter) => setter.active).map((setter) => <option key={setter.id} value={setter.id}>{setter.name}</option>)}
            </select> : <span className={`${inputClassName} flex items-center bg-card`}>{lead.responsibleSetterName ?? t("detail.unassigned")}</span>}
          </label>
          <div className="flex min-w-0 flex-col gap-1.5 text-sm font-bold"><span>{t("detail.changeOutcome")}</span><div className="flex flex-wrap gap-2">
            {CRM_LEAD_OUTCOMES.filter((outcome) => outcome !== "none").map((outcome) => <Button key={outcome} type="button" variant="outline" className="min-h-11" disabled={isPending} onClick={() => changeOutcome(outcome)}>{t(CRM_OUTCOME_LABEL_KEYS[outcome])}</Button>)}
            {(lead.outcome === "lost" || lead.outcome === "no_show") && <div className="flex basis-full flex-wrap items-end gap-2 border-t border-border pt-3">
              <label className="flex min-w-48 flex-1 flex-col gap-1.5">{t("detail.reopenStage")}
                <select value={reopenStage} disabled={isPending} onChange={(event) => setReopenStage(event.target.value as CrmLeadStage)} className={inputClassName}>
                  {CRM_LEAD_STAGES.map((stage) => <option key={stage} value={stage}>{t(CRM_STAGE_LABEL_KEYS[stage])}</option>)}
                </select>
              </label>
              <Button type="button" variant="outline" className="min-h-11" disabled={isPending} onClick={reopen}>{t("detail.reopen")}</Button>
            </div>}
          </div></div>
          </div>
        </div>
      </section>

      <div className={inDrawer ? "flex flex-col gap-5" : "grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.32fr)_minmax(18rem,0.88fr)] lg:items-start"}>
        <div className="flex min-w-0 flex-col gap-5">
      <section id="lead-details" className="sticker-card scroll-mt-6 p-4 sm:p-6" aria-labelledby="crm-lead-details-title">
        <DetailSectionHeader headingId="crm-lead-details-title" icon={UserRound} title={t("detail.leadDetails")} trailing={fieldsMessage && <p className="text-sm font-bold text-state-healthy" role="status">{fieldsMessage}</p>} />
        <fieldset className="mt-5 grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">{t("detail.leadDetails")}</legend>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold sm:col-span-2">{t("detail.displayName")}<input value={fields.displayName} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, displayName: event.target.value }))} className={inputClassName} /></label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold">{t("detail.firstName")}<input value={fields.firstName} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, firstName: event.target.value }))} className={inputClassName} /></label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold">{t("detail.lastName")}<input value={fields.lastName} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, lastName: event.target.value }))} className={inputClassName} /></label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold">{t("detail.offer")}<select value={fields.offerId} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, offerId: event.target.value }))} className={inputClassName}><option value="">{t("detail.noOffer")}</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold">{t("detail.source")}<select value={fields.source} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, source: event.target.value as CrmLeadSource }))} className={inputClassName}>{CRM_LEAD_SOURCES.map((source) => <option key={source} value={source}>{t(`leads.sourceOptions.${source}`)}</option>)}</select></label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold">{t("detail.potentialValue")}<input type="number" min={0} value={fields.potentialValueEur} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, potentialValueEur: event.target.value }))} className={inputClassName} /></label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold">{t("detail.email")}<input type="email" inputMode="email" autoComplete="email" value={fields.email} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, email: event.target.value }))} className={inputClassName} /></label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold">{t("detail.phone")}<input type="tel" inputMode="tel" autoComplete="tel" value={fields.phone} disabled={isPending} onChange={(event) => setFields((current) => ({ ...current, phone: event.target.value }))} className={inputClassName} /></label>
          <label className="flex min-w-0 flex-col gap-1.5 text-sm font-bold sm:col-span-2">{t("detail.closer")}<select value={fields.closerUserId} disabled={isPending} onChange={(event) => { const selected = closers.find((closer) => closer.id === event.target.value); setFields((current) => ({ ...current, closerUserId: event.target.value, closer: selected?.name ?? "" })); }} className={inputClassName}><option value="">{t("detail.unassigned")}</option>{closers.map((closer) => <option key={closer.id} value={closer.id}>{closer.name}</option>)}</select></label>
        </fieldset>
        <Button type="button" variant="outline" className="mt-5 min-h-11" disabled={isPending} onClick={saveFields}>{t("detail.saveFields")}</Button>
      </section>

      <section id="qualification" className="sticker-card scroll-mt-6 p-4 sm:p-6" aria-labelledby="crm-qualification-note-title">
        <DetailSectionHeader headingId="crm-qualification-note-title" icon={FileText} title={t("detail.qualificationNote")} description={t("detail.qualificationHint")} trailing={lead.qualificationNote && <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-bold text-accent-text">{t("detail.qualificationPresent")}</span>} />
        <label htmlFor="crm-qualification-note" className="sr-only">{t("detail.qualificationNote")}</label>
        <textarea id="crm-qualification-note" value={qualification} onChange={(event) => { setQualification(event.target.value); setQualificationDirty(true); }} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); saveQualification(); } }} placeholder={t("detail.qualificationPlaceholder")} rows={5} className={`${textareaClassName} mt-5`} />
        <div className="mt-4 flex flex-wrap items-center gap-3"><Button type="button" variant="outline" className="min-h-11" disabled={isPending} onClick={saveQualification}>{isPending ? t("detail.saving") : t("detail.saveQualification")}</Button><p className="text-sm text-muted-foreground" aria-live="polite">{qualificationMessage}</p></div>
      </section>

      <section id="team-notes" className="sticker-card scroll-mt-6 p-4 sm:p-6" aria-labelledby="crm-quick-note-title">
        <DetailSectionHeader headingId="crm-quick-note-title" icon={NotebookPen} title={t("detail.notes")} />
        <div className="mt-5 flex flex-col gap-4">
          {lead.comments.length > 0 && <ul className="divide-y divide-border rounded-[var(--radius-control)] border border-border bg-muted/20 px-3">{lead.comments.slice(-3).map((comment) => <li key={comment.id} className="py-3 first:pt-0 last:pb-0"><p className="text-sm leading-6">{comment.body}</p><p className="mt-1 text-xs text-muted-foreground">{comment.authorName ?? t("detail.unknownAuthor")} · {new Date(comment.createdAt).toLocaleString()}</p></li>)}</ul>}
          <label htmlFor="crm-team-note" className="flex flex-col gap-1.5 text-sm font-bold"><span>{t("detail.addNote")}</span><textarea id="crm-team-note" value={note} onChange={(event) => setNote(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); addNote(); } }} placeholder={t("detail.notePlaceholder")} rows={3} className={`${textareaClassName} font-normal`} /></label>
          <Button type="button" variant="outline" className="min-h-11 self-start" disabled={isPending || !note.trim()} onClick={addNote}>{t("detail.saveNote")}</Button>
        </div>
      </section>

        </div>
        <div className="flex min-w-0 flex-col gap-5">
      <section id="next-action" className="sticker-card scroll-mt-6 p-4 sm:p-6" aria-labelledby="crm-quick-action-title">
        <DetailSectionHeader headingId="crm-quick-action-title" icon={CalendarClock} title={t("detail.nextAction")} description={t("detail.nextActionHelp")} trailing={<span className="shrink-0 text-right text-xs text-muted-foreground">{lead.nextAction ? new Date(lead.nextAction.dueAt).toLocaleString() : t("leads.noNextAction")}</span>} />
        <div className="mt-5"><CrmActionForm leadId={lead.id} /></div>
      </section>

      <section id="history" className="sticker-card scroll-mt-6 p-4 sm:p-6" aria-labelledby="crm-history-title">
        <DetailSectionHeader headingId="crm-history-title" icon={History} title={t("detail.history")} />
        {lead.stageHistory.length === 0 && lead.events.length === 0 ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("detail.noHistory")}</p> : <ul className="mt-4 flex flex-col gap-3 text-sm">
          {lead.stageHistory.map((item) => <li key={item.id} className="border-l-2 border-accent pl-3"><span className="font-bold">{t(CRM_STAGE_LABEL_KEYS[item.toStage])}</span><span className="ml-2 text-muted-foreground">{new Date(item.changedAt).toLocaleString()}</span>{item.actorName && <span className="ml-2 text-muted-foreground">· {item.actorName}</span>}</li>)}
          {lead.events.filter((event) => !["first_message_sent", "conversation_started"].includes(event.type)).map((event) => <li key={event.id} className="border-l-2 border-border pl-3"><span className="font-bold">{t(CRM_EVENT_LABEL_KEYS[event.type])}</span><span className="ml-2 text-muted-foreground">{new Date(event.occurredAt ?? event.createdAt).toLocaleString()}</span>{event.actorName && <span className="ml-2 text-muted-foreground">· {event.actorName}</span>}</li>)}
        </ul>}
      </section>

      <section id="calls" className="sticker-card scroll-mt-6 p-4 sm:p-6" aria-labelledby="crm-calls-title">
        <DetailSectionHeader headingId="crm-calls-title" icon={PhoneCall} title={t("tabs.calls")} />
        {lead.calls.length === 0 ? <p className="mt-4 text-sm leading-6 text-muted-foreground">{t("detail.noCalls")}</p> : <ul className="mt-4 flex flex-col gap-3 text-sm">{lead.calls.map((call) => <li key={call.id} className="flex items-start gap-2"><PhoneCall className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="min-w-0"><p className="font-bold">{call.inviteeName || callsT("unnamed")}</p><p className="mt-1 text-muted-foreground">{new Date(call.scheduledAt).toLocaleString()}</p></div></li>)}</ul>}
      </section>
        </div>
      </div>
      <CrmLossDialog lead={lead} open={lossDialogOpen} onOpenChange={setLossDialogOpen} onSaved={handleLost} />
      <CrmSaleValidationDialog lead={lead} offers={offers} setters={setters} closers={closers} open={saleDialogOpen} onOpenChange={setSaleDialogOpen} onValidated={() => setLead((current) => ({ ...current, outcome: "sold", isNoShow: false }))} />
      <ConfirmationDialog
        open={deleteDialogOpen}
        title={t("detail.deleteTitle", { name: lead.displayName })}
        description={t("detail.deleteDescription")}
        confirmLabel={t("detail.deleteConfirm")}
        cancelLabel={t("detail.deleteCancel")}
        pendingLabel={t("detail.deleting")}
        pending={isPending}
        error={deleteError}
        onCancel={() => { setDeleteDialogOpen(false); setDeleteError(null); }}
        onConfirm={deleteLead}
      />
    </div>
  );
}
