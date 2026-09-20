"use client";

import { Check, Copy, Link2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { CrmBookingAvailabilityView, CrmLeadDetails } from "@/lib/crm/types";
import type { NativeBookingAnswerValue, NativeBookingQuestionRecord } from "@/lib/native-booking/questions";
import { isValidPhoneNumber } from "@/lib/native-booking/validation";

import { createInternalBookingAction, getBookingLinkAction, getInternalBookingSlotsAction, recordBookingLinkSentAction } from "./crm-actions";

type BookingLead = Pick<CrmLeadDetails, "id" | "displayName" | "firstName" | "lastName" | "email" | "phone">;
type BookingContact = { firstName: string; lastName: string; email: string; phone: string };

const inputClassName = "min-h-11 rounded-[var(--radius-control)] border border-border bg-background px-3 font-normal outline-none transition-colors focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent/20";

function contactFromLead(lead: BookingLead): BookingContact {
  const nameParts = lead.displayName.trim().split(/\s+/).filter(Boolean);
  return {
    firstName: lead.firstName || nameParts[0] || "",
    lastName: lead.lastName || nameParts.slice(1).join(" "),
    email: lead.email ?? "",
    phone: lead.phone ?? "",
  };
}

function questionIsAnswered(question: NativeBookingQuestionRecord, value: NativeBookingAnswerValue | undefined): boolean {
  return Array.isArray(value) ? value.some((item) => item.trim().length > 0) : Boolean(value?.trim());
}

function BookingQuestionField({ question, value, error, onChange, optionalLabel, selectPlaceholder }: {
  question: NativeBookingQuestionRecord;
  value: NativeBookingAnswerValue | undefined;
  error?: string;
  onChange: (value: NativeBookingAnswerValue) => void;
  optionalLabel: string;
  selectPlaceholder: string;
}) {
  const inputId = `crm-booking-question-${question.id}`;
  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  const label = <>{question.label}{!question.isRequired && <span className="ml-1 font-normal text-muted-foreground">({optionalLabel})</span>}</>;

  if (question.type === "radio" || question.type === "checkbox") {
    return (
      <fieldset className="flex flex-col gap-2" aria-describedby={error ? `${inputId}-error` : undefined}>
        <legend className="text-sm font-bold">{label}</legend>
        {question.helpText && <p className="text-xs text-muted-foreground">{question.helpText}</p>}
        <div className="mt-1 flex flex-col gap-2">
          {question.options.map((option) => {
            const checked = selectedValues.includes(option);
            return (
              <label key={option} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-[var(--radius-control)] border px-3 text-sm ${checked ? "border-accent bg-accent/5" : "border-border bg-background hover:border-accent"}`}>
                <input
                  type={question.type}
                  name={inputId}
                  value={option}
                  checked={checked}
                  onChange={(event) => onChange(question.type === "radio" ? option : event.target.checked ? [...selectedValues, option] : selectedValues.filter((item) => item !== option))}
                  className="size-4 accent-accent"
                />
                {option}
              </label>
            );
          })}
        </div>
        {error && <p id={`${inputId}-error`} className="text-xs font-bold text-state-critical" role="alert">{error}</p>}
      </fieldset>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-bold">{label}</label>
      {question.helpText && <p className="text-xs text-muted-foreground">{question.helpText}</p>}
      {question.type === "textarea" ? (
        <textarea id={inputId} rows={3} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className={`${inputClassName} resize-y py-2`} aria-invalid={Boolean(error)} aria-describedby={error ? `${inputId}-error` : undefined} />
      ) : question.type === "select" ? (
        <select id={inputId} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className={inputClassName} aria-invalid={Boolean(error)} aria-describedby={error ? `${inputId}-error` : undefined}>
          <option value="">{selectPlaceholder}</option>
          {question.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      ) : (
        <input id={inputId} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className={inputClassName} aria-invalid={Boolean(error)} aria-describedby={error ? `${inputId}-error` : undefined} />
      )}
      {error && <p id={`${inputId}-error`} className="text-xs font-bold text-state-critical" role="alert">{error}</p>}
    </div>
  );
}

async function copyToClipboard(value: string) {
  if (typeof navigator.clipboard?.writeText === "function") {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) throw new Error("Clipboard copy failed");
}

export function CrmBookingActions({ lead, onBooked }: { lead: BookingLead; onBooked: (booking: { scheduledAt: string; timeZone: string; closerName: string }) => void }) {
  const t = useTranslations("crm.detail");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const [linkStatus, setLinkStatus] = useState<string | null>(null);
  const [bookingStatus, setBookingStatus] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [linkRecorded, setLinkRecorded] = useState(false);
  const [availability, setAvailability] = useState<CrmBookingAvailabilityView | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [selectedValue, setSelectedValue] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [contact, setContact] = useState<BookingContact>(() => contactFromLead(lead));
  const [answers, setAnswers] = useState<Record<string, NativeBookingAnswerValue>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [linkPending, setLinkPending] = useState(false);
  const [linkIdempotencyKey, setLinkIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const [bookingIdempotencyKey, setBookingIdempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const isBusy = isPending || linkPending;

  const absoluteLink = link && typeof window !== "undefined" ? new URL(link, window.location.origin).toString() : link;
  const selectedSlot = useMemo(() => {
    const [startAt, closerUserId] = selectedValue.split("|");
    return availability?.slots.find((slot) => slot.startAt === startAt && slot.closerUserId === closerUserId) ?? null;
  }, [availability, selectedValue]);

  function updateContact(field: keyof BookingContact, value: string) {
    setContact((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function updateAnswer(question: NativeBookingQuestionRecord, value: NativeBookingAnswerValue) {
    setAnswers((current) => ({ ...current, [question.id]: value }));
    setFieldErrors((current) => {
      const key = `question:${question.id}`;
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function validateBookingForm(): boolean {
    const errors: Record<string, string> = {};
    if (!contact.firstName.trim()) errors.firstName = t("bookingFirstNameRequired");
    if (!contact.lastName.trim()) errors.lastName = t("bookingLastNameRequired");
    if (!contact.email.trim()) errors.email = t("bookingEmailRequired");
    else if (!/^\S+@\S+\.\S+$/.test(contact.email.trim())) errors.email = t("bookingEmailInvalid");
    if (!contact.phone.trim() || !isValidPhoneNumber(contact.phone)) errors.phone = t("bookingPhoneInvalid");
    if (!selectedSlot) errors.slot = t("bookingSlotRequired");
    for (const question of availability?.questions ?? []) {
      if (question.isRequired && !questionIsAnswered(question, answers[question.id])) errors[`question:${question.id}`] = t("bookingQuestionRequired");
    }
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      setBookingError(t("bookingCheckDetails"));
      return false;
    }
    return true;
  }

  useEffect(() => {
    if (!linkCopied) return;

    const timeoutId = window.setTimeout(() => setLinkCopied(false), 2200);
    return () => window.clearTimeout(timeoutId);
  }, [linkCopied]);

  async function copyBookingLink() {
    if (linkPending) return;
    setLinkStatus(null);
    setLinkCopied(false);
    setLinkPending(true);
    try {
      let href = link;
      if (!href) {
        const result = await getBookingLinkAction();
        if (result.error) {
          setLinkStatus(result.error);
          return;
        }
        if (!result.href) {
          setLinkStatus(t("bookingNoLink"));
          return;
        }
        href = result.href;
      }

      const resolved = new URL(href, window.location.origin).toString();
      try {
        await copyToClipboard(resolved);
      } catch {
        setLinkStatus(t("bookingCopyError"));
        return;
      }
      setLink(href);
      setLinkCopied(true);

      if (!linkRecorded) {
        const recorded = await recordBookingLinkSentAction({ leadId: lead.id, idempotencyKey: linkIdempotencyKey });
        if (recorded.error) {
          setLinkStatus(recorded.error);
          return;
        }
        setLinkRecorded(true);
        setLinkIdempotencyKey(globalThis.crypto.randomUUID());
      }

      setLinkStatus(t("bookingLinkCopied"));
    } catch {
      setLinkStatus(t("bookingRequestError"));
    } finally {
      setLinkPending(false);
    }
  }

  function openInternalBooking() {
    setBookingError(null);
    setBookingStatus(null);
    setContact(contactFromLead(lead));
    setAnswers({});
    setFieldErrors({});
    startTransition(async () => {
      try {
        const result = await getInternalBookingSlotsAction({ leadId: lead.id });
        if (result.error) {
          setBookingError(result.error);
          return;
        }
        if (!result.availability) {
          setBookingError(t("bookingNoSlots"));
          return;
        }
        setAvailability(result.availability);
        const firstSlot = result.availability.slots[0];
        setSelectedValue(firstSlot ? `${firstSlot.startAt}|${firstSlot.closerUserId}` : "");
        setAnswers(Object.fromEntries(result.availability.questions.map((question) => [question.id, question.type === "checkbox" ? [] : ""])));
        setBookingOpen(true);
      } catch {
        setBookingError(t("bookingRequestError"));
      }
    });
  }

  function confirmInternalBooking() {
    if (!validateBookingForm()) return;
    if (!selectedSlot || !availability) return;
    setBookingError(null);
    startTransition(async () => {
      try {
        const result = await createInternalBookingAction({
          leadId: lead.id,
          startAt: selectedSlot.startAt,
          closerUserId: selectedSlot.closerUserId,
          idempotencyKey: bookingIdempotencyKey,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          phone: contact.phone,
          guestTimeZone: availability.timeZone,
          answers,
        });
        if (result.error || !result.call) {
          setBookingError(result.error ?? t("bookingSaveError"));
          return;
        }
        setBookingOpen(false);
        setBookingStatus(t("bookingSaved"));
        setBookingIdempotencyKey(globalThis.crypto.randomUUID());
        onBooked(result.call);
      } catch {
        setBookingError(t("bookingRequestError"));
      }
    });
  }

  const dateFormatter = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: availability?.timeZone });

  return (
    <section className="rounded-[var(--radius-control)] border border-border bg-muted/20 p-3" aria-labelledby="crm-booking-actions-title">
      <h2 id="crm-booking-actions-title" className="text-sm font-bold">{t("bookingTitle")}</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1.2fr)_minmax(12rem,0.8fr)]">
        <div className="rounded-[var(--radius-control)] border border-border bg-card p-3" aria-busy={linkPending}>
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-muted text-muted-foreground" aria-hidden="true">
              <Link2 className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">{t("bookingLinkLabel")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("bookingLinkCopyHint")}</p>
            </div>
          </div>

          {absoluteLink ? (
            <div className="mt-3 flex min-w-0 items-center gap-2 rounded-[var(--radius-control)] border border-border bg-muted/20 p-2">
              <a href={absoluteLink} target="_blank" rel="noreferrer" title={absoluteLink} className="min-w-0 flex-1 truncate text-xs font-bold text-accent-text underline underline-offset-2">{absoluteLink}</a>
              <Button type="button" variant="outline" className="min-h-11 shrink-0 px-3" disabled={isBusy} onClick={() => void copyBookingLink()}>
                {linkCopied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                {linkPending ? t("bookingLinkCopying") : linkCopied ? t("bookingLinkCopied") : t("copyBookingLink")}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="outline" className="mt-3 min-h-11 w-full" disabled={isBusy} onClick={() => void copyBookingLink()}>
              <Copy aria-hidden="true" />
              {linkPending ? t("bookingLinkCopying") : t("copyBookingLink")}
            </Button>
          )}

          {linkStatus && <p className="mt-2 text-sm font-bold text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">{linkStatus}</p>}
        </div>

        <Button type="button" variant="outline" className="min-h-11 w-full self-start" disabled={isBusy} onClick={openInternalBooking}>{t("bookForProspect")}</Button>
      </div>
      {bookingStatus && <p className="mt-2 text-sm font-bold text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">{bookingStatus}</p>}
      {bookingError && <p className="mt-2 text-sm font-bold text-state-critical" role="alert">{bookingError}</p>}

      <Dialog open={bookingOpen} onOpenChange={(open) => { if (!isPending) setBookingOpen(open); }}>
        <DialogContent className="max-h-[min(86vh,720px)] overflow-y-auto">
          <DialogTitle>{t("bookForProspectTitle", { name: lead.displayName })}</DialogTitle>
          <p className="mt-2 text-sm text-muted-foreground">{availability ? t("bookingAvailabilityHelp", { timeZone: availability.timeZone }) : t("bookingLoading")}</p>
          {availability && availability.slots.length === 0 && (
            <div className="mt-4 rounded-[var(--radius-control)] bg-state-caution/10 p-3 text-sm text-state-caution">
              <p className="font-bold">{availability.calendarNeedsAttention ? t("bookingCalendarUnavailable") : t("bookingNoSlots")}</p>
              {availability.calendarNeedsAttention && <a href="/settings/calendars" className="mt-1 inline-flex min-h-11 items-center font-bold text-accent-text underline underline-offset-2">{t("bookingCalendarSettings")}</a>}
            </div>
          )}
          {availability && availability.slots.length > 0 && (
            <div className="mt-5 flex flex-col gap-5">
              <label className="flex flex-col gap-1.5 text-sm font-bold" htmlFor="crm-booking-slot">
                {t("bookingSlot")}
                <select id="crm-booking-slot" value={selectedValue} onChange={(event) => { setSelectedValue(event.target.value); setFieldErrors((current) => { const next = { ...current }; delete next.slot; return next; }); }} className={inputClassName} aria-invalid={Boolean(fieldErrors.slot)} aria-describedby={fieldErrors.slot ? "crm-booking-slot-error" : undefined}>
                  {availability.slots.map((slot) => <option key={`${slot.startAt}-${slot.closerUserId}`} value={`${slot.startAt}|${slot.closerUserId}`}>{dateFormatter.format(new Date(slot.startAt))} · {slot.closerName}</option>)}
                </select>
                {fieldErrors.slot && <span id="crm-booking-slot-error" className="text-xs font-bold text-state-critical" role="alert">{fieldErrors.slot}</span>}
              </label>

              {selectedSlot && !selectedSlot.calendarReady && <div className="rounded-[var(--radius-control)] border border-state-caution/30 bg-state-caution/10 p-3 text-sm text-foreground"><p className="font-bold">{t("bookingCalendarNotReady")}</p><a href="/settings/calendars" className="mt-1 inline-flex min-h-11 items-center font-bold text-accent-text underline underline-offset-2">{t("bookingCalendarSettings")}</a></div>}

              <fieldset className="rounded-[var(--radius-control)] border border-border p-3 sm:p-4">
                <legend className="px-1 text-sm font-bold">{t("bookingContactTitle")}</legend>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("bookingContactHelp")}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5 text-sm font-bold" htmlFor="crm-booking-first-name">
                    {t("bookingFirstName")}
                    <input id="crm-booking-first-name" value={contact.firstName} onChange={(event) => updateContact("firstName", event.target.value)} onBlur={() => { if (!contact.firstName.trim()) setFieldErrors((current) => ({ ...current, firstName: t("bookingFirstNameRequired") })); }} className={inputClassName} aria-invalid={Boolean(fieldErrors.firstName)} aria-describedby={fieldErrors.firstName ? "crm-booking-first-name-error" : undefined} autoComplete="given-name" />
                    {fieldErrors.firstName && <span id="crm-booking-first-name-error" className="text-xs font-bold text-state-critical" role="alert">{fieldErrors.firstName}</span>}
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-bold" htmlFor="crm-booking-last-name">
                    {t("bookingLastName")}
                    <input id="crm-booking-last-name" value={contact.lastName} onChange={(event) => updateContact("lastName", event.target.value)} onBlur={() => { if (!contact.lastName.trim()) setFieldErrors((current) => ({ ...current, lastName: t("bookingLastNameRequired") })); }} className={inputClassName} aria-invalid={Boolean(fieldErrors.lastName)} aria-describedby={fieldErrors.lastName ? "crm-booking-last-name-error" : undefined} autoComplete="family-name" />
                    {fieldErrors.lastName && <span id="crm-booking-last-name-error" className="text-xs font-bold text-state-critical" role="alert">{fieldErrors.lastName}</span>}
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-bold" htmlFor="crm-booking-email">
                    {t("bookingEmail")}
                    <input id="crm-booking-email" type="email" value={contact.email} onChange={(event) => updateContact("email", event.target.value)} onBlur={() => { const error = !contact.email.trim() ? t("bookingEmailRequired") : !/^\S+@\S+\.\S+$/.test(contact.email.trim()) ? t("bookingEmailInvalid") : undefined; setFieldErrors((current) => { const next = { ...current }; if (error) next.email = error; else delete next.email; return next; }); }} className={inputClassName} aria-invalid={Boolean(fieldErrors.email)} aria-describedby={fieldErrors.email ? "crm-booking-email-error" : undefined} autoComplete="email" inputMode="email" />
                    {fieldErrors.email && <span id="crm-booking-email-error" className="text-xs font-bold text-state-critical" role="alert">{fieldErrors.email}</span>}
                  </label>
                  <label className="flex flex-col gap-1.5 text-sm font-bold" htmlFor="crm-booking-phone">
                    {t("bookingPhone")}
                    <input id="crm-booking-phone" type="tel" value={contact.phone} onChange={(event) => updateContact("phone", event.target.value)} onBlur={() => { const error = !contact.phone.trim() || !isValidPhoneNumber(contact.phone) ? t("bookingPhoneInvalid") : undefined; setFieldErrors((current) => { const next = { ...current }; if (error) next.phone = error; else delete next.phone; return next; }); }} className={inputClassName} aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={fieldErrors.phone ? "crm-booking-phone-error" : undefined} autoComplete="tel" />
                    {fieldErrors.phone && <span id="crm-booking-phone-error" className="text-xs font-bold text-state-critical" role="alert">{fieldErrors.phone}</span>}
                    <span className="text-xs font-normal text-muted-foreground">{t("bookingPhoneHelp")}</span>
                  </label>
                </div>
              </fieldset>

              {availability.questions.length > 0 && <fieldset className="flex flex-col gap-4 border-t border-border pt-4"><legend className="text-sm font-bold">{t("bookingQuestionsTitle")}</legend>{availability.questions.map((question) => <BookingQuestionField key={question.id} question={question} value={answers[question.id]} error={fieldErrors[`question:${question.id}`]} onChange={(value) => updateAnswer(question, value)} optionalLabel={t("bookingOptional")} selectPlaceholder={t("bookingSelectAnswer")} />)}</fieldset>}
            </div>
          )}
          {bookingError && <p className="mt-3 text-sm font-bold text-state-critical" role="alert">{bookingError}</p>}
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" className="min-h-11" disabled={isBusy} onClick={() => setBookingOpen(false)}>{t("bookingCancel")}</Button>
            <Button type="button" variant="default" className="min-h-11" disabled={isBusy || !selectedSlot} onClick={confirmInternalBooking}>{isPending ? t("bookingSaving") : t("bookingConfirm")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
